/**
 * Process environment and CLI shims that bind git, gh, and lark-cli to the deployment's accounts and block disallowed
 * commands, one chain's and one local project's at a time.
 * Variables read by workers avoid `KEY|PASSWORD|SECRET|TOKEN` in their names because DSH strips credential-shaped variables from child environments.
 * Provides default-path guardrails rather than an OS-level security boundary, as workers run under the operator's OS user.
 */
import { lstat, mkdir, readdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import type { SubprocessOutputReader, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { Deployment } from '../deployment.ts'
import { SetupError } from '../setup.ts'
import { CliError } from './commands.ts'

const MARKER = '# Written by dsh-superagent on every start; edits are lost.'
/** Markers of files written under the project's earlier names (`dsh-tag`, `dsh-go`, `dsh-freelancer`), which `dsh-superagent` owns and replaces too. */
const LEGACY_MARKERS = ['dsh-tag', 'dsh-go', 'dsh-freelancer'].map(name => `# Written by ${name} on every start; edits are lost.`)
/** Commands workers need, which `blockedCommands` cannot block: the shims and git. */
export const WORKER_COMMANDS: readonly string[] = ['gh', 'git', 'lark-cli']
/** Whether `name` is a command name a `blockedCommands` list may carry: a bare name, never `.` or `..`. */
export const commandName = (name: string): boolean => /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && name !== '..'
/** A chain's command shims and isolated git configuration. */
export interface WorkerPaths { bin: string; gitconfig: string }
/**
 * The commands a worker of one project may not call: the deployment's list, then the project's own, without duplicates.
 * The commands workers need stay callable even if a stored list names one, so a project can only add to the deployment's
 * bottom line and never take from it.
 */
export function effectiveBlockedCommands(deployment: readonly string[], project: readonly string[] = []): string[] {
  return [...new Set([...deployment, ...project])].filter(name => !WORKER_COMMANDS.includes(name))
}
/**
 * The worker environment files of one chain. The deployment's primary chain keeps the installation-wide paths; every other
 * chain gets its own `worker-bin-<chain>` and `worker-gitconfig-<chain>` beside them, so two chains never share a `gh` shim
 * or a github.com credential helper.
 * @param chain - chain id, or undefined for the primary chain.
 */
export function workerPaths(stateDir: string, chain?: string): WorkerPaths {
  const suffix = chain ? `-${chain}` : ''
  return { bin: join(stateDir, `worker-bin${suffix}`), gitconfig: join(stateDir, `worker-gitconfig${suffix}`) }
}
export const workerBin = (stateDir: string, chain?: string): string => workerPaths(stateDir, chain).bin
export const workerGitConfig = (stateDir: string, chain?: string): string => workerPaths(stateDir, chain).gitconfig
/**
 * The shim directory of one local project's extra blocked commands. It sits before the chain's directory on a worker's
 * PATH, so only that project's Tickets fail the call while every other project, chain and deployment command stays as it
 * was. It is separate from `worker-bin-<chain>` because a project owns a chain whose id is the project's, and both
 * directories may hold a command of the same name.
 */
export const workerProjectBin = (stateDir: string, project: string): string => join(stateDir, `worker-bin-project-${project}`)
const shellQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`
const gitQuote = (value: string): string => `"${value.replace(/[\\"]/g, char => `\\${char}`)}"`
export const credentialHelper = (cli: string): string => `!${shellQuote(cli)} auth git-credential`

export function sameDirectory(a: string, b: string): boolean {
  const real = (path: string): string => { try { return realpathSync(path) } catch { return resolve(path) } }
  return real(a) === real(b)
}
export function withoutDirectory(path: string, dir: string): string {
  return path.split(delimiter).filter(entry => !sameDirectory(entry, dir)).join(delimiter)
}

/**
 * The explicit environment of a worker command: the project's shim directory (when it has one), the chain's shims, the
 * isolated git configuration, and no interactive git prompts.
 */
export function workerEnvironment(stateDir: string, path: string, chain?: string, project?: string): Record<string, string> {
  const paths = workerPaths(stateDir, chain)
  return {
    PATH: [project ? workerProjectBin(stateDir, project) : undefined, paths.bin, path].filter(entry => entry !== undefined).join(delimiter),
    GIT_CONFIG_GLOBAL: paths.gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_ASKPASS: '',
    GIT_TERMINAL_PROMPT: '0',
  }
}

/**
 * The variables that tell git which repository, work tree and index to act on. A host started inside git, such as by
 * `git rebase --exec`, passes them on, and a git started below it would act on that repository. GIT_CEILING_DIRECTORIES is
 * kept: it names no repository, and it stops git's search for one where the operator chose.
 */
export const GIT_LOCATION: readonly string[] = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE']

/**
 * Returns environment variable overrides that strip ambient GitHub tokens, interactive prompts, the repository the host's own
 * environment may name, and operator git identity/config overrides.
 */
export function agentVariables(stateDir: string): Record<string, string | undefined> {
  return {
    GH_TOKEN: undefined, GITHUB_TOKEN: undefined,
    // A worker's git finds the repository from its directory, never from the host's environment.
    ...Object.fromEntries(GIT_LOCATION.map(name => [name, undefined])),
    GIT_CONFIG_GLOBAL: workerGitConfig(stateDir), GIT_CONFIG_NOSYSTEM: '1',
    // Clear environment git config overrides; configuration passed through the environment would otherwise reach every git command the agent runs.
    GIT_CONFIG_COUNT: undefined, GIT_CONFIG_PARAMETERS: undefined,
    // When the credential helper has no answer, git must fail rather than prompt; `GIT_ASKPASS: ''` also overrides `core.askPass` and `SSH_ASKPASS`.
    GIT_ASKPASS: '', SSH_ASKPASS: undefined, GIT_TERMINAL_PROMPT: '0',
    // Clear operator commit identity variables; prompts specify commit identity and operator env vars would override what a worker sets.
    GIT_AUTHOR_NAME: undefined, GIT_COMMITTER_NAME: undefined, GIT_AUTHOR_EMAIL: undefined, GIT_COMMITTER_EMAIL: undefined,
  }
}

/** True when a regular file starts with the dsh-superagent marker in its first two lines; a symbolic link, directory, or other non-regular file never counts as written by dsh-superagent. */
async function written(file: string): Promise<boolean> {
  if (!(await lstat(file)).isFile()) return false
  const head = (await readFile(file, 'utf8')).split('\n', 2)
  return [MARKER, ...LEGACY_MARKERS].some(marker => head.includes(marker))
}
async function own(file: string, text: string, mode = 0o644): Promise<void> {
  let foreign = false
  try { foreign = !await written(file) } catch { /* The file does not exist yet. */ }
  if (foreign) throw new SetupError('foreignFile', { file })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, text, { mode })
  await rename(temporary, file)
}

/** One chain's worker accounts: its GitHub CLI and login, and the Feishu bot every chain shares. */
export type WorkerTarget = Pick<Deployment, 'stateDir' | 'github'> & { chain?: string }
/** A deployment's worker accounts, with the configured chains when the Source carries more than the primary one. */
export type WorkerDeployment = WorkerTarget & { feishu?: Deployment['feishu']; chains?: Record<string, WorkerTarget> }
/**
 * The worker environments to write or check, keyed by the chain id that names their files: `undefined` for the deployment's
 * primary chain, which keeps the installation-wide paths, then every other configured chain.
 */
export function workerTargets(deployment: WorkerDeployment): [string | undefined, WorkerTarget][] {
  const chains = deployment.chains ? Object.values(deployment.chains) : []
  if (!chains.length) return [[undefined, deployment]]
  const primary = deployment.chain ?? chains[0]?.chain
  return chains.map(target => [target.chain === undefined || target.chain === primary ? undefined : target.chain, target])
}

/**
 * Atomically writes the worker CLI shims and the isolated git configuration file of every chain into the state directory,
 * refusing to overwrite foreign files.
 * Each shim strips the shim directory from PATH before exec so wrapper scripts resolving `gh` or `lark-cli` by name reach the real binary.
 */
export async function writeEnvironment(deployment: WorkerDeployment, blockedCommands: readonly string[]): Promise<void> {
  for (const [chain, target] of workerTargets(deployment)) await writeChain(deployment.stateDir, chain, target, deployment.feishu, blockedCommands)
}

/** One shim file: the command name it answers to and the shell body after the shebang and marker. */
interface Shim { name: string; body: string }
const failBody = (message: string): string => `echo ${shellQuote(message)} >&2\nexit 1`

/**
 * Writes `shims` into `dir`, replacing the ones dsh-superagent wrote there and removing the shims it wrote earlier that
 * the list no longer holds. Workers may be running concurrently: each shim is written to a temp file and atomically
 * renamed, so no command ever resolves past the directory. A file dsh-superagent did not write stops the write.
 */
async function syncShims(dir: string, shims: readonly Shim[]): Promise<void> {
  await mkdir(dir, { recursive: true })
  const before = await readdir(dir)
  for (const name of before) { const file = join(dir, name); if (!await written(file)) throw new SetupError('foreignFile', { file }) }
  const kept = new Set<string>()
  for (const { name, body } of shims) {
    const temporary = join(dir, `.${name}.${process.pid}.tmp`)
    await writeFile(temporary, `#!/bin/sh\n${MARKER}\n${body}\n`, { mode: 0o755 })
    await rename(temporary, join(dir, name))
    kept.add(name)
  }
  for (const name of before) if (!kept.has(name)) await unlink(join(dir, name))
}

/**
 * Writes one local project's blocked-command shims, and removes the ones it no longer blocks. The directory holds only
 * these commands; the project's chain keeps the `gh`, `lark-cli` and deployment-level shims a worker also reads. A project
 * with no extra commands keeps no directory, so the state directory lists one only for the projects that add any.
 */
export async function writeProjectCommands(stateDir: string, project: string, blockedCommands: readonly string[]): Promise<void> {
  const dir = workerProjectBin(stateDir, project)
  const names = effectiveBlockedCommands(blockedCommands)
  // Nothing to write and nothing left from an earlier list: skip creating a directory a worker would only read past.
  if (!names.length && !await lstat(dir).then(entry => entry.isDirectory(), () => false)) return
  await syncShims(dir, names.map(name => ({ name, body: failBody(`${name} is blocked in this project; use gh, which acts as the agent's account.`) })))
  // A list cleared to nothing leaves no directory, so the state directory lists one only for projects that add a command.
  if (!names.length) await rmdir(dir).catch(() => { /* Another writer put something back; the shims are gone either way. */ })
}

/** Writes one chain's shims and git configuration, and removes the shims of commands it no longer blocks. */
async function writeChain(stateDir: string, chain: string | undefined, target: WorkerTarget, feishu: Deployment['feishu'],
  blockedCommands: readonly string[]): Promise<void> {
  const { github } = target
  const { bin: dir, gitconfig } = workerPaths(stateDir, chain)
  const withoutShims = [
    `self=${shellQuote(dir)}`, 'rest=', 'IFS=:', 'set -f',
    'for entry in $PATH; do [ "$entry" = "$self" ] || rest="${rest:+$rest:}$entry"; done',
    'set +f', 'unset IFS', 'PATH=$rest', 'export PATH',
  ].join('\n')
  const run = (program: string): string => `${withoutShims}\nexec ${shellQuote(program)} "$@"`
  await syncShims(dir, [
    { name: 'gh', body: run(github.cli) },
    { name: 'lark-cli', body: feishu ? run(feishu.cli) : failBody('lark-cli is unavailable: this installation has no Feishu bot.') },
    ...effectiveBlockedCommands(blockedCommands).map(name => ({ name,
      body: failBody(`${name} is blocked in this installation; use gh, which acts as ${github.login}.`) })),
  ])
  await own(gitconfig, [
    MARKER,
    // Make git refuse to commit without an explicit identity set by the worker instead of guessing from the operator's OS user.
    '[user]', '\tuseConfigOnly = true',
    '[credential]', '\thelper =',
    '[credential "https://github.com"]', `\thelper = ${gitQuote(credentialHelper(github.cli))}`,
    '[url "https://github.com/"]', '\tinsteadOf = git@github.com:', '\tinsteadOf = ssh://git@github.com/',
    // Include Git LFS filters because the operator's global gitconfig (which usually holds them) is ignored.
    '[filter "lfs"]', '\tclean = git-lfs clean -- %f', '\tsmudge = git-lfs smudge -- %f', '\tprocess = git-lfs filter-process', '\trequired = true',
  ].join('\n') + '\n')
}

/** Spawns a command through the DSH subprocess runtime, which strips credential-shaped environment variables. */
export async function runAsWorker(subprocess: SubprocessRuntime, argv: string[], cwd: string, signal: AbortSignal, env?: Record<string, string>): Promise<string> {
  const handle = subprocess.spawn({ argv, cwd, graceMs: 2000, signal, ...env ? { env } : {}, stdio: { stdin: 'ignore', stdout: { maxBytes: 1 << 20 }, stderr: { maxBytes: 1 << 16 } } })
  const { exitCode } = await handle.done
  const read = (reader: SubprocessOutputReader | undefined): string => reader?.readFrom(0).text ?? ''
  if (exitCode === 0) return read(handle.collected.stdout)
  const ended = exitCode === null ? 'was stopped before it finished' : `exited with ${exitCode}`
  throw new CliError(read(handle.collected.stderr).trim() || `${argv.join(' ')} ${ended}`, undefined, exitCode ?? undefined)
}

/** Verifies that every chain's worker git resolves that chain's GitHub credential helper. */
export async function verifyEnvironment(deployment: WorkerDeployment, subprocess: SubprocessRuntime, signal: AbortSignal,
  environment: (chain?: string) => Record<string, string>): Promise<void> {
  for (const [chain, target] of workerTargets(deployment)) {
    const { gitconfig } = workerPaths(deployment.stateDir, chain)
    // `-z` separates fields with NUL and never quotes paths.
    const helpers = (await runAsWorker(subprocess, ['git', 'config', '-z', '--show-origin', '--get-all', 'credential.https://github.com.helper'],
      deployment.stateDir, AbortSignal.any([signal, AbortSignal.timeout(60_000)]), environment(chain)).catch(() => '')).split('\0')
    if (helpers.join('\0') !== [`file:${gitconfig}`, credentialHelper(target.github.cli), ''].join('\0')) throw new SetupError('gitTooOld')
  }
}

/**
 * Verifies that a ticket directory's local or worktree git config defines no custom `credential.*` or `http.*extraheader`
 * keys, which the agent's git would read from the repository's own config and act on.
 */
export async function verifyDirectory(directory: string, subprocess: SubprocessRuntime, signal: AbortSignal,
  env?: Record<string, string>): Promise<void> {
  const keys = ['git', 'config', '-z', '--show-scope', '--get-regexp', '^(credential\\..*|http\\..*extraheader)$']
  // `git config --get-regexp` exits with code 1 when no keys match.
  const output = await runAsWorker(subprocess, keys, directory, AbortSignal.any([signal, AbortSignal.timeout(60_000)]), env)
    .catch((error: unknown) => { if (error instanceof CliError && error.exitCode === 1) return ''; throw error })
  const scoped = output.split('\0')
  const local = scoped.flatMap((scope, index) => index % 2 === 0 && (scope === 'local' || scope === 'worktree') ? [scoped[index + 1]!.split('\n')[0]!] : [])
  if (local.length) throw new Error(`The git configuration of the repository in ${directory} sets ${local.join(', ')}, which the agent's git would also read; remove them.`)
}
