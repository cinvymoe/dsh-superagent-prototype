/**
 * Whether the running checkout can take a local merge, and the one merge at a time it runs through the service script.
 * The panel only asks this module: it never runs git or pnpm itself, never restarts or stops dsh-superagent, and writes
 * nothing to the checkout, so the merged build takes effect when a person next restarts the service.
 */
import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readdirSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { UserError } from '../core/index.ts'
import { GIT_LOCATION } from '../infra/environment.ts'
import type { Checkout, CheckoutReason, CheckoutView } from './checkout.ts'

/** Why the running checkout cannot take a local merge beyond its own codes: no configured chain names it, or it has no commit. */
export const PREPARE_REASONS = ['noChain', 'empty'] as const
export type PrepareReason = CheckoutReason | typeof PREPARE_REASONS[number]

/** One configured chain: its id, and the `owner/name` code repository its tickets execute in. */
export interface PrepareChain { id: string; repository: string }

/** What one run of the service script needs: its working directory, its environment, and where its output goes. */
export interface PrepareRunOptions { cwd: string; env: Record<string, string | undefined>; sink: (chunk: string) => void }
/** Runs one action of the service script in the checkout, writes each output chunk to `sink`, and answers its exit code. */
export type PrepareRun = (file: string, args: string[], options: PrepareRunOptions) => Promise<number>

/** What a merge answers: whether the commit moved, the commit now on disk, and the absolute path of the run's log. */
export interface PrepareResult { merged: boolean; head: string | null; log: string }
/** The facts the panel reads about a local merge, before and while one runs. */
export interface PrepareStatus { checkout: CheckoutView; chain: string | null; repository: string | null; available: boolean;
  reasons: PrepareReason[]; running: boolean }

export interface PrepareOptions {
  /** The running checkout, the one `Checkout` the Runtime also answers `GET deployment/checkout` with, so both routes share a start reading. */
  checkout: Pick<Checkout, 'status'>
  /** The checkout's root, where the service script runs. */
  directory: string
  /** The service script that is the only writer, `scripts/dsh-superagent`. */
  script: string
  /** Where each run's log goes, `<stateDir>/prepare`. */
  logDir: string
  /** The configured chains, read when a status asks, so setup that has not finished reports none. */
  chains: () => PrepareChain[]
  /** The script runner, injectable for tests; the default spawns the script and pipes both streams to the sink. */
  run?: PrepareRun
}

/** The most of a run's output a failure reports, in characters. */
const TAIL_CHARS = 4000
/** The log files kept in the log directory, newest first. */
const KEEP_LOGS = 10

/** A file name stamp that sorts by time: `YYYYMMDD-HHmmss`, as the service script's logs use. */
const stamp = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')

/** Spawns the script directly (it has a shebang and the executable bit) and streams stdout and stderr to the sink. */
const spawnRun: PrepareRun = (file, args, { cwd, env, sink }) => new Promise<number>((resolve, reject) => {
  const child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let ended = false
  const finish = (done: () => void): void => { if (!ended) { ended = true; done() } }
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => sink(chunk))
  child.stderr.on('data', (chunk: string) => sink(chunk))
  child.on('error', error => finish(() => reject(error)))
  child.on('close', code => finish(() => resolve(code ?? 1)))
})

/**
 * The running checkout as a local merge sees it: the configured chain whose code repository one of its remotes names, and
 * whether it can take a merge at all. `merge()` runs `scripts/dsh-superagent prepare --repository <repository>` once at a
 * time, keeps its output in `<logDir>/prepare-<stamp>-<pid>.log`, and answers the commit it left on disk. It never writes
 * to the checkout itself, never signals a process, and never restarts the service: the merged build takes effect when a
 * person restarts it.
 */
export class Prepare {
  private running = false
  constructor(private readonly options: PrepareOptions) {}

  /**
   * The checkout's facts, the chain whose code repository it names, and why it cannot take a merge. The reasons are the
   * checkout's own, then `noChain` when no chain names it, then `empty` when it has no commit; none makes it available.
   */
  async status(): Promise<PrepareStatus> {
    const checkout = await this.options.checkout.status()
    const repositories = new Set(checkout.remotes.flatMap(remote => remote.repository === null ? [] : [remote.repository]))
    const chain = this.options.chains().find(item => repositories.has(item.repository.toLowerCase()))
    const reasons: PrepareReason[] = [...checkout.reasons]
    if (!chain) reasons.push('noChain')
    if (checkout.head === null) reasons.push('empty')
    return { checkout, chain: chain?.id ?? null, repository: chain ? chain.repository.toLowerCase() : null,
      available: reasons.length === 0, reasons, running: this.running }
  }

  /**
   * Runs the service script's `prepare` in the checkout, which fetches the chain's main and rebuilds. The single-flight
   * flag is taken before the first await, so a second request while one runs refuses rather than starting another; a run
   * that fails answers the script's output tail and the log that holds all of it, and a later call may run again.
   */
  async merge(): Promise<PrepareResult> {
    if (this.running) throw new UserError('prepareBusy')
    this.running = true
    try {
      const status = await this.status()
      if (!status.available || status.repository === null) throw new UserError('prepareUnavailable', { reasons: status.reasons.join(',') })
      const before = status.checkout.head
      const log = this.logPath()
      const output = this.capture(log)
      try {
        let failed = false
        try {
          const run = this.options.run ?? spawnRun
          failed = await run(this.options.script, ['prepare', '--repository', status.repository],
            { cwd: this.options.directory, env: this.environment(), sink: output.sink }) !== 0
        } catch (error) {
          // A script that cannot even start leaves its own message in the log and the tail, so the panel shows why.
          output.sink(`${error instanceof Error ? error.message : String(error)}\n`)
          failed = true
        }
        if (failed) throw new UserError('prepareFailed', { message: output.tail(), log })
      } finally { output.close() }
      const head = (await this.options.checkout.status()).head
      return { merged: head !== before, head, log }
    } finally { this.running = false }
  }

  /** Opens one run's log in the log directory and keeps its last TAIL_CHARS characters in memory for a failure. */
  private capture(log: string): { sink: (chunk: string) => void; tail: () => string; close: () => void } {
    mkdirSync(this.options.logDir, { recursive: true, mode: 0o700 })
    const fd = openSync(log, 'a', 0o600)
    let tail = ''
    return {
      sink: chunk => {
        try { writeSync(fd, chunk) } catch { /* The run's own answer still reaches the panel. */ }
        tail = (tail + chunk).slice(-TAIL_CHARS)
      },
      tail: () => tail.trim(),
      close: () => {
        try { closeSync(fd) } catch { /* The output already reached disk. */ }
        this.prune()
      },
    }
  }

  /** Keeps the newest KEEP_LOGS logs, by the timestamp in their name; a log directory that cannot be listed keeps its files. */
  private prune(): void {
    try {
      const logs = readdirSync(this.options.logDir).filter(name => name.startsWith('prepare-') && name.endsWith('.log')).sort().reverse()
      for (const name of logs.slice(KEEP_LOGS)) unlinkSync(join(this.options.logDir, name))
    } catch { /* Nothing to prune. */ }
  }

  /** An absolute path under the log directory; the timestamp and pid keep the panel's logs apart from the service's. */
  private logPath(): string { return join(this.options.logDir, `prepare-${stamp(new Date())}-${process.pid}.log`) }

  /**
   * The script's environment: the operator's own, so its git keeps the credentials the terminal uses, without the variables
   * that would point git at another repository, and without an interactive prompt or askpass that could hang the panel.
   */
  private environment(): Record<string, string | undefined> {
    return { ...process.env, ...Object.fromEntries(GIT_LOCATION.map(name => [name, undefined])),
      GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' }
  }
}
