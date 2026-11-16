/**
 * Whether a merged build reaches the machine that runs this panel: the pull and rebuild `Prepare` already performs, then one
 * restart by whatever supervises this process. A process a systemd unit started asks that unit's own supervisor to restart
 * it, through a transient unit outside this process's cgroup, so the restart outlives the process it replaces; a process no
 * supervisor owns cannot land itself and reports why, leaving the restart to a person exactly as a merge did before.
 *
 * `policy.delivery.land` decides whether a merge asks for a landing at all; this module never reads the Policy, so a caller
 * that already refused the landing cannot start one by accident. A landing waits while a worker runs, because a restart
 * would cut it off: it throws `Later`, which reschedules the effect rather than counting a failure.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Later } from './effects.ts'
import type { Checkout } from './checkout.ts'
import type { Prepare, PrepareReason, PrepareStatus } from './prepare.ts'

/** Why a merge did not land beyond the prepare reasons: no supervisor owns this process, or a worker was running. */
export const LANDING_REASONS = ['unsupervised', 'running'] as const
export type LandingReason = PrepareReason | typeof LANDING_REASONS[number]

/** What the panel and the effect see about a landing before one runs. */
export interface LandingStatus {
  /** The systemd unit that can restart this process, or `null` when no supervisor owns it. */
  unit: string | null
  /** Whether a merge could land now: a supervisor owns the process, the checkout takes a merge, and no worker runs. */
  available: boolean
  reasons: LandingReason[]
  /** How many worker Sessions a restart would interrupt now. */
  running: number
  prepare: PrepareStatus
}

/** What one landing answered: whether the build moved and the supervisor was asked to restart it. */
export interface LandingResult { landed: boolean; head: string | null; reason?: LandingReason | 'otherRepository' | 'current' | 'restartFailed' }

/** What the default supervisor restart answers: its exit status and the whole output, for the landing's log. */
export interface RestartResult { ok: boolean; output: string }

export interface LandingOptions {
  /** The running checkout, the same one `Prepare` reads, so the landing and the panel agree on the commit. */
  checkout: Pick<Checkout, 'status'>
  /** The pull and rebuild; a landing never runs git or pnpm itself. */
  prepare: Pick<Prepare, 'status' | 'merge'>
  /** The worker Sessions running now, read on each attempt: a landing waits for none. */
  running: () => number
  /** The unit that started this process, read from the process instead of configured; injectable for tests. */
  unit?: () => string | null
  /** Asks the supervisor to restart the unit; the default runs `systemd-run` detached, injectable for tests. */
  restart?: (unit: string) => RestartResult
  /** Where a landing writes what it asked the supervisor, `<stateDir>/prepare`. */
  logDir: string
}

/** The most of a restart's output a failure reports, in characters. */
const TAIL_CHARS = 2000
/** Seconds between the supervisor accepting the restart and the unit actually restarting. */
const RESTART_DELAY = 3

/** Reads the process's own cgroup file; a host without one, or without permission, names no supervisor. */
function readCgroup(): string {
  try { return readFileSync('/proc/self/cgroup', 'utf8') } catch { return '' }
}

/**
 * The systemd unit this process runs in, from its own cgroup line (`0::/system.slice/dsh-web.service`), or `null` when it
 * runs under no service unit such as a person's shell or the service script's own session.
 */
export function supervisorUnit(cgroup: string = readCgroup()): string | null {
  for (const line of cgroup.split('\n')) {
    const index = line.indexOf('/system.slice/')
    if (index < 0) continue
    const name = line.slice(index + '/system.slice/'.length).replace(/\/.*$/, '').trim()
    if (name.endsWith('.service')) return name
  }
  return null
}

/**
 * Asks systemd to restart `unit` from a transient unit outside this process's own cgroup, so stopping the service cannot
 * interrupt the request. The delay lets the effect's transaction commit before the process goes away.
 */
function supervisorRestart(unit: string): RestartResult {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '')
  const result = spawnSync('systemd-run',
    ['--quiet', '--collect', `--on-active=${RESTART_DELAY}`, `--unit=dsh-superagent-land-${stamp}`, 'systemctl', 'restart', unit],
    { encoding: 'utf8', timeout: 30_000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  if (result.error) return { ok: false, output: `${result.error.message}\n${output}`.trim() }
  return { ok: result.status === 0, output }
}

/**
 * One landing at a time on the running checkout. `status()` answers whether a merge could land now and why not, and
 * `land()` pulls the chain's main, rebuilds, and asks the supervisor to restart the process; it throws `Later` while a
 * worker runs, so the effect retries once the queue drains rather than interrupting a Session.
 */
export class Landing {
  constructor(private readonly options: LandingOptions) {}

  /** The checkout, the merge's reasons, the supervisor and how many workers a restart would interrupt now. */
  async status(): Promise<LandingStatus> {
    const prepare = await this.options.prepare.status()
    const unit = (this.options.unit ?? supervisorUnit)()
    const running = this.options.running()
    const reasons: LandingReason[] = [...prepare.reasons]
    if (unit === null) reasons.push('unsupervised')
    if (running > 0) reasons.push('running')
    return { unit, available: reasons.length === 0, reasons, running, prepare }
  }

  /**
   * Lands a merge of `repository`: refused unless it is the repository this checkout tracks, and unless a supervisor owns
   * the process. A merge that does not move the commit lands nothing; one that does asks the supervisor to restart, and a
   * restart the supervisor refuses is reported as `restartFailed` with the request's output.
   */
  async land(repository: string): Promise<LandingResult> {
    const status = await this.status()
    const head = status.prepare.checkout.head
    if (status.prepare.repository !== repository.toLowerCase()) return { landed: false, head, reason: 'otherRepository' }
    const refused = status.reasons.find(reason => reason !== 'running')
    if (refused) return { landed: false, head, reason: refused }
    if (status.running > 0) throw new Later()
    const result = await this.options.prepare.merge()
    if (!result.merged) return { landed: false, head: result.head, reason: 'current' }
    // A worker queued while the build ran still gets its turn: the restart waits for the next attempt of the same effect.
    if (this.options.running() > 0) throw new Later()
    const restart = (this.options.restart ?? supervisorRestart)(status.unit!)
    this.log({ repository, unit: status.unit!, head: result.head, restart })
    return restart.ok ? { landed: true, head: result.head } : { landed: false, head: result.head, reason: 'restartFailed' }
  }

  /** Keeps what the landing asked the supervisor in one file, so a restart that never happened can be read afterwards. */
  private log(entry: { repository: string; unit: string; head: string | null; restart: RestartResult }): void {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
    const path = join(this.options.logDir, `land-${stamp}-${process.pid}.log`)
    const tail = entry.restart.output.slice(-TAIL_CHARS)
    try {
      mkdirSync(this.options.logDir, { recursive: true, mode: 0o700 })
      writeFileSync(path, `${entry.restart.ok ? 'asked' : 'refused'} ${entry.unit} to restart for ${entry.repository} at ${entry.head ?? 'no commit'}\n${tail}\n`,
        { mode: 0o600 })
    } catch { /* A landing that cannot write its log still restarts. */ }
  }
}
