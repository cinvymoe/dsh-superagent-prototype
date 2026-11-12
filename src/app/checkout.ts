/** Read-only status of the checkout dsh-superagent runs from, from local git commands alone. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GIT_LOCATION } from '../infra/environment.ts'

const exec = promisify(execFile)

/** Why a checkout cannot receive a local merge, in the order a status reports them. */
export const CHECKOUT_REASONS = ['notGit', 'noRepository', 'detached', 'notMain', 'dirty'] as const
export type CheckoutReason = typeof CHECKOUT_REASONS[number]

/** The git subcommands a checkout read runs: all local and read-only, and none reaching a remote. */
export const CHECKOUT_GIT: readonly string[] = ['rev-parse', 'symbolic-ref', 'config', 'status', 'log']

/** Runs one local git command in a directory and answers its standard output; a failed command rejects. */
export type Git = (args: string[], cwd: string) => Promise<string>

/** A remote of a checkout, named by its remote name, with the GitHub repository it names or `null` for any other remote. */
export interface CheckoutRemote { name: string; repository: string | null }
/** The facts a checkout read found on disk, before any judgement. */
export interface CheckoutReading { root: string | null; repository: string | null; branch: string | null; head: string | null; committedAt: string | null;
  dirty: boolean; remotes: CheckoutRemote[] }
/** The checkout as this instance found it at startup, which a restart compares the disk against. */
export interface CheckoutStart { head: string | null; dirty: boolean }
/** The status the management API answers. */
export interface CheckoutView { path: string; repository: string | null; branch: string | null; head: string | null; committedAt: string | null;
  dirty: boolean; remotes: CheckoutRemote[]; available: boolean; reasons: CheckoutReason[]; restartRequired: boolean }

/**
 * The GitHub remote forms git accepts: `https` with optional user and token, `ssh`, `git+ssh` and `git`, and the scp form,
 * each with the host, an optional port, `owner/name` and an optional `.git` and trailing slash. Only github.com names a repository.
 */
const GITHUB_REMOTE = /^(?:https:\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/|(?:ssh|git\+ssh|git):\/\/(?:git@)?github\.com(?::\d+)?\/|(?:git@)?github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i

/**
 * `owner/name` a GitHub remote names, lowercase, for the https and ssh forms git accepts; undefined for any other remote,
 * such as another host, a local path, or a URL with segments after the repository.
 */
export function repositoryOf(remote: string): string | undefined {
  const match = GITHUB_REMOTE.exec(remote.trim())
  return match ? `${match[1]!.toLowerCase()}/${match[2]!.toLowerCase()}` : undefined
}

/**
 * Every remote a checkout names, from the `remote.<name>.url` lines of `git config --get-regexp '^remote\..*\.url$'`,
 * each with the GitHub repository its URL names, or `null` for a remote that names none, sorted by remote name. A remote
 * with several URLs reports the first git prints, and any line that is not such a key is ignored.
 */
export function checkoutRemotes(output: string): CheckoutRemote[] {
  const found = new Map<string, string>()
  for (const line of output.split('\n')) {
    const separator = line.indexOf(' ')
    if (separator < 0) continue
    const key = line.slice(0, separator)
    if (!key.startsWith('remote.') || !key.endsWith('.url')) continue
    const name = key.slice('remote.'.length, -'.url'.length)
    if (name && !found.has(name)) found.set(name, line.slice(separator + 1).trim())
  }
  return [...found].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, url]) => ({ name, repository: repositoryOf(url) ?? null }))
}

/**
 * Reads a directory's checkout facts with local git commands only: its root, origin repository, branch, commit and its
 * time, dirty tree, and every remote. Each command is read on its own, so a failed one leaves its fact unknown rather
 * than failing the read; a tree whose status cannot be read counts as dirty, since a read never calls a checkout clean
 * without inspecting it.
 */
export async function readCheckout(git: Git, directory: string): Promise<CheckoutReading> {
  const read = async (args: string[], cwd: string): Promise<string | undefined> => {
    try { return (await git(args, cwd)).trim() } catch { return undefined }
  }
  const root = await read(['rev-parse', '--show-toplevel'], directory)
  if (!root) return { root: null, repository: null, branch: null, head: null, committedAt: null, dirty: false, remotes: [] }
  // `symbolic-ref` fails on a detached HEAD, which `rev-parse --abbrev-ref` would instead report as the branch `HEAD`.
  const [branch, head, committed, remote, status, remotes] = await Promise.all([
    read(['symbolic-ref', '--quiet', '--short', 'HEAD'], root),
    read(['rev-parse', 'HEAD'], root),
    read(['log', '-1', '--format=%cI'], root),
    read(['config', '--get', 'remote.origin.url'], root),
    read(['status', '--porcelain'], root),
    read(['config', '--get-regexp', '^remote\\..*\\.url$'], root),
  ])
  // A failed `status` is undefined rather than empty, and counts as dirty: a read never calls a checkout clean uninspected.
  const dirty = status !== ''
  return { root, repository: remote ? repositoryOf(remote) ?? null : null, branch: branch || null, head: head || null,
    committedAt: committed || null, dirty, remotes: remotes ? checkoutRemotes(remotes) : [] }
}

/**
 * Why a reading cannot receive a local merge, in CHECKOUT_REASONS order: a directory that is no checkout reports `notGit`
 * alone, and a checkout can lack a repository, sit on a detached HEAD or another branch, and have a dirty tree.
 */
export function checkoutReasons(reading: CheckoutReading): CheckoutReason[] {
  if (reading.root === null) return ['notGit']
  const reasons: CheckoutReason[] = []
  if (reading.repository === null) reasons.push('noRepository')
  // A detached HEAD reports `detached` alone: it has no branch that could be another one.
  if (reading.branch === null) reasons.push('detached')
  else if (reading.branch !== 'main') reasons.push('notMain')
  if (reading.dirty) reasons.push('dirty')
  return reasons
}

/** Whether the code on disk changed, or the tree was already dirty, since this instance started. */
export function restartRequired(start: CheckoutStart, head: string | null): boolean {
  return start.dirty || start.head !== head
}

/**
 * One local git command in a directory, with the variables that would point git at another repository and any interactive
 * prompt cleared. It refuses every subcommand outside CHECKOUT_GIT, so a read can neither reach a remote nor change the tree.
 */
async function runGit(args: string[], cwd: string): Promise<string> {
  const subcommand = args[0]
  if (subcommand === undefined || !CHECKOUT_GIT.includes(subcommand)) throw new Error(`${String(subcommand)} is not a read-only checkout command`)
  const { stdout } = await exec('git', args, { cwd, timeout: 10_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, ...Object.fromEntries(GIT_LOCATION.map(name => [name, undefined])), GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' } })
  return stdout
}

/**
 * The checkout the running plugin was loaded from: what it was when this instance started, and what it is now.
 * The start reading begins in the constructor, so a merge that lands before the first status request still reports the restart.
 */
export class Checkout {
  private readonly start: Promise<CheckoutStart>
  constructor(private readonly directory: string, private readonly git: Git = runGit) {
    // A start reading that fails keeps no fact: a missing git makes the route answer unknown facts rather than fail.
    this.start = readCheckout(git, directory).then(reading => ({ head: reading.head, dirty: reading.dirty }), () => ({ head: null, dirty: false }))
  }
  /** The checkout on disk now, judged against the reading this instance started on. */
  async status(): Promise<CheckoutView> {
    const start = await this.start
    const reading = await readCheckout(this.git, this.directory)
    const reasons = checkoutReasons(reading)
    return { path: reading.root ?? this.directory, repository: reading.repository, branch: reading.branch, head: reading.head,
      committedAt: reading.committedAt, dirty: reading.dirty, remotes: reading.remotes, available: reasons.length === 0, reasons,
      restartRequired: restartRequired(start, reading.head) }
  }
}
