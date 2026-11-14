/** Plugin configuration and startup verification for repository access and agent CLI identities. */
import { LIMITS } from './limits.ts'
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import type { Volatile } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { z } from 'zod'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { runAsWorker, sameDirectory, withoutDirectory, workerBin } from './infra/environment.ts'
import { SetupError } from './setup.ts'

const reason = (error: unknown): string => error instanceof Error ? error.message : String(error)
const absolute = (description: string) => s.string().pattern(/^\//).description(`${description} Absolute path.`)
/** Plugin configuration of the dsh-superagent entry. Volatile fields apply without a restart because dsh-superagent reads them on each use; changing `stateDir` remounts the plugin. */
export const Config = s.object({
  stateDir: absolute('Directory for the database, locks, worker shims, the agent\'s git configuration and, by default, the ticket directories.').required(),
  promptMaxChars: s.number().min(LIMITS.promptMaxChars.min).max(LIMITS.promptMaxChars.max).step(1).default(100000)
    .description('Largest saved prompt configuration, in characters.').volatile(),
  admissionContextMaxPages: s.number().min(LIMITS.admissionContextMaxPages.min).max(LIMITS.admissionContextMaxPages.max).step(1).default(10)
    .description('Pages of thread context one assessment may read.').volatile(),
  admissionContextTimeoutMs: s.number().min(LIMITS.admissionContextTimeoutMs.min).max(LIMITS.admissionContextTimeoutMs.max).step(1)
    .default(15000).description('Time limit of one context read during an assessment, in milliseconds.').volatile(),
})
export type DeploymentConfig = ReturnType<typeof Config>
export interface Machine {
  stateDir: string
  promptMaxChars: Volatile<number>
  admissionContextMaxPages: Volatile<number>
  admissionContextTimeoutMs: Volatile<number>
}
const MOVED: Record<string, string> = {
  repository: 'on the GitHub Source', branchPrefix: 'in the prepare command of the Execution settings', github: 'on the GitHub Source',
  feishu: 'on the Feishu Source', author: 'prompt text', repositoryPath: 'in the prepare command of the Execution settings',
  worktreeRoot: 'the ticket directory of the Execution settings', blockedCommands: 'in the Execution settings',
}

/** Read machine settings and reject unknown configuration keys (naming where deprecated keys moved). */
export function machineOf(config: DeploymentConfig): Machine {
  const unknown = Object.keys(config).filter(key => !(key in (Config.dict ?? {})))
  if (unknown.length) throw new Error(`dsh-superagent configuration has keys it does not use: ${unknown.map(key => MOVED[key] ? `${key} (now ${MOVED[key]})` : key).join(', ')}; docs/006-deployment.md lists the keys`)
  const { stateDir, promptMaxChars, admissionContextMaxPages, admissionContextTimeoutMs } = config
  return { stateDir, promptMaxChars, admissionContextMaxPages, admissionContextTimeoutMs }
}

const REPOSITORY = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?$/
/** A repository the Source requires: `owner/name`, never blank. */
const REQUIRED_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const CHAIN = /^[a-z][a-z0-9-]*$/
/** One independent intake repository -> code repository chain, with an optional CLI of its own. */
export const GithubChainSchema = z.object({
  /** Stable chain id in lowercase kebab-case; it identifies threads and tickets that come from this chain. */
  id: z.string().trim().regex(CHAIN, 'lowercase kebab-case'),
  /** Repository whose Issues, notifications and comments the Source receives; resolves to `codeRepository` when blank. */
  intakeRepository: z.string().trim().regex(REPOSITORY, 'owner/name').default(''),
  /** Repository workers check out, push branches to, and open pull requests in. */
  codeRepository: z.string().trim().regex(REQUIRED_REPOSITORY, 'owner/name'),
  /** GitHub CLI and account of this chain; blank uses the Source-level `cli`. */
  cli: z.string().trim().default(''),
}).strict().transform(chain => ({ ...chain, intakeRepository: chain.intakeRepository || chain.codeRepository }))
export type GithubChain = z.infer<typeof GithubChainSchema>
export const GithubConfigSchema = z.object({
  /** Independent repository pairs handled by this Source; setup needs at least one. */
  chains: z.array(GithubChainSchema).default([]),
  cli: z.string().trim().default(''),
  pollSeconds: z.number().int().min(60).max(3600).default(60),
  failuresBeforeError: z.number().int().min(1).max(20).default(3),
  observeIssues: z.boolean().default(false),
  observePulls: z.boolean().default(false),
  observeComments: z.boolean().default(false),
  observeCi: z.boolean().default(false),
}).strict()
export type GithubConfig = z.infer<typeof GithubConfigSchema>
/**
 * Normalize a stored GitHub Source configuration. A configuration without `chains` that still names the legacy
 * single-repository fields becomes one `default` chain; the legacy fields are dropped either way. Only reading uses
 * this: saving through the panel validates with the strict schema, so the stored configuration then holds `chains`.
 */
export function normalizeGithubConfig(stored: unknown): Record<string, unknown> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
  const { repository, intakeRepository, codeRepository, ...rest } = stored as Record<string, unknown>
  if ('chains' in rest) return rest
  const code = typeof codeRepository === 'string' && codeRepository ? codeRepository : typeof repository === 'string' ? repository : ''
  const intake = typeof intakeRepository === 'string' ? intakeRepository : ''
  return { ...rest, chains: code ? [{ id: 'default', intakeRepository: intake, codeRepository: code }] : [] }
}
/** Resolve a chain's repositories, defaulting an unset intake repository to the code repository. */
export function githubRepositories(chain: Pick<GithubChain, 'intakeRepository' | 'codeRepository'>): { intake: string; code: string } {
  const code = chain.codeRepository
  return { code, intake: chain.intakeRepository || code }
}
/** The configured chains. */
export function githubChains(config: { chains?: readonly GithubChain[] }): GithubChain[] {
  return config.chains ? [...config.chains] : []
}
export const FeishuBotSchema = z.object({ cli: z.string().trim().default('') })
/** Source configuration keys that affect deployment setup and trigger a restart when changed. */
export const SETUP_FIELDS: Readonly<Record<string, readonly string[]>> = { github: ['chains', 'cli'], feishu: Object.keys(FeishuBotSchema.shape) }

export interface DeploymentTarget extends Machine {
  /** Chain id; absent for legacy callers that construct a single deployment by hand. */
  chain?: string
  /** Code repository: workers check out and open pull requests here. */
  repository: string
  /** Repository whose Issues are received and discussed; equal to `repository` when not split. */
  intakeRepository: string
  github: { cli: string; login: string; noreply: string }
}
export interface Deployment extends DeploymentTarget {
  /** Every configured chain, keyed by chain id. */
  chains?: Record<string, DeploymentTarget>
  feishu?: FeishuBot
}
export interface FeishuBot { cli: string; appId: string; brand: 'feishu' | 'lark'; botId: string; name: string }

/** Resolve a command name or absolute path to an executable file, ignoring the worker shim directory. */
export function executable(name: string, path: string, exclude?: string): string {
  if (name.includes('/') && !isAbsolute(name)) throw new Error(`${name} must be a command name or an absolute path`)
  const candidates = isAbsolute(name) ? [name] : path.split(delimiter).filter(dir => isAbsolute(dir) && !(exclude && sameDirectory(dir, exclude))).map(dir => join(dir, name))
  for (const candidate of candidates) {
    try { if (statSync(candidate).isFile()) { accessSync(candidate, constants.X_OK); return candidate } }
    catch { /* Not an executable file here; try the next PATH directory. */ }
  }
  throw new Error(`${name} is not an executable file${isAbsolute(name) ? '' : ' on PATH'}`)
}

export type Probe = (argv: string[]) => Promise<string>
/** Run startup checks through DSH's worker subprocess service with worker shims removed from PATH so a `gh` wrapper script reaches the real binary. */
export function workerProbe(subprocess: SubprocessRuntime, stateDir: string, cwd: string, signal: AbortSignal): Probe {
  const path = withoutDirectory(process.env.PATH ?? '', workerBin(stateDir))
  return argv => runAsWorker(subprocess, ['env', `PATH=${path}`, ...argv], cwd, AbortSignal.any([signal, AbortSignal.timeout(60_000)]))
}

const GithubUser = z.object({ login: z.string().regex(/^[A-Za-z0-9-]+$/), id: z.number().int().positive() })
const RepositoryAccess = z.object({ name: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), push: z.boolean().nullable() })
function parsed<T>(schema: z.ZodType<T>, text: string): T | undefined {
  let value: unknown
  try { value = JSON.parse(text) } catch { return undefined /* Non-JSON output; the caller surfaces the setup failure. */ }
  const result = schema.safeParse(value)
  return result.success ? result.data : undefined
}
/** Verify each chain's GitHub CLI identity, its push access to the code repository, and read access to the intake repository. */
export async function resolveDeployment(machine: Machine, github: unknown, probe: Probe, path = process.env.PATH ?? ''): Promise<Deployment> {
  const { stateDir } = machine
  const config = GithubConfigSchema.parse(normalizeGithubConfig(github ?? {}))
  const chains = githubChains(config)
  if (!chains.length) throw new SetupError('repositoryUnset')
  // One CLI may serve several chains; probe its account once and share the result, as the Source's account did before chains could differ.
  const identities = new Map<string, { cli: string; id: number; login: string }>()
  const identity = async (name: string, chain: string): Promise<{ cli: string; id: number; login: string }> => {
    if (!name) throw new SetupError('agentCliUnset', { chain })
    const cached = identities.get(name)
    if (cached) return cached
    let cli: string
    try { cli = executable(name, path, workerBin(stateDir)) } catch (error) {
      throw new SetupError('agentCliMissing', { chain, cli: name, output: reason(error) })
    }
    const text = await probe([cli, 'api', 'user']).catch((error: unknown) => {
      throw new SetupError('agentCliSignedOut', { chain, cli: name, output: reason(error) })
    })
    const agent = parsed(GithubUser, text)
    if (!agent) throw new SetupError('agentCliNoAccount', { chain, cli: name })
    const resolved = { cli, id: agent.id, login: agent.login }
    identities.set(name, resolved)
    return resolved
  }
  const lookup = async (agent: { cli: string; login: string }, cli: string, chain: string, remote: string, requirePush: boolean): Promise<string> => {
    // Use the canonical repository name returned by GitHub so renamed repositories match incoming notifications.
    const access = parsed(RepositoryAccess, await probe([agent.cli, 'api', `repos/${remote}`, '--jq', '{name: .full_name, push: .permissions.push}']).catch((error: unknown) => {
      throw new SetupError('repositoryUnreadable', { account: agent.login, repository: remote, chain, cli, output: reason(error) })
    }))
    if (!access) throw new SetupError('repositoryUnreported', { repository: remote, chain, cli })
    if (requirePush && access.push !== true) throw new SetupError('repositoryReadOnly', { account: agent.login, repository: access.name, chain, cli })
    return access.name
  }
  const targets: Record<string, DeploymentTarget> = {}
  for (const chain of chains) {
    if (Object.hasOwn(targets, chain.id)) throw new SetupError('chainDuplicate', { chain: chain.id })
    const name = chain.cli || config.cli
    const agent = await identity(name, chain.id)
    const { code: codeRemote, intake: intakeRemote } = githubRepositories(chain)
    if (!codeRemote) throw new SetupError('repositoryUnset', { chain: chain.id })
    const repository = await lookup(agent, name, chain.id, codeRemote, true)
    const intakeRepository = intakeRemote === codeRemote ? repository : await lookup(agent, name, chain.id, intakeRemote, false)
    targets[chain.id] = { ...machine, chain: chain.id, repository, intakeRepository,
      github: { cli: agent.cli, login: agent.login, noreply: `${agent.id}+${agent.login}@users.noreply.github.com` } }
  }
  const first = targets[chains[0]!.id]!
  return { ...first, chains: targets }
}
const AuthStatus = z.object({ appId: z.string().regex(/^cli_[A-Za-z0-9]+$/), brand: z.enum(['feishu', 'lark']).default('feishu'), identities: z.object({ bot: z.object({ status: z.string() }) }) })
const BotInfo = z.object({ bot: z.object({ open_id: z.string().regex(/^ou_[A-Za-z0-9]+$/), app_name: z.string().default('') }) })
/**
 * Verify that the configured Feishu CLI is authenticated as a bot and restricted to strict mode `bot`.
 * Workers invoke this CLI as `lark-cli`, so a CLI that also permits a user identity would let workers act as that user.
 */
export async function resolveFeishuBot(machine: Machine, feishu: unknown, probe: Probe, path = process.env.PATH ?? ''): Promise<FeishuBot | undefined> {
  const { cli: name } = FeishuBotSchema.parse(feishu ?? {})
  if (!name) return undefined
  const fail = (error: unknown): never => { throw error instanceof SetupError ? error : new SetupError('feishuCliFailed', { output: reason(error) }) }
  let cli = ''
  try { cli = executable(name, path, workerBin(machine.stateDir)) } catch (error) { fail(error) }
  const run = (...args: string[]): Promise<string> => probe(['env', 'LARKSUITE_CLI_NO_UPDATE_NOTIFIER=1', 'LARKSUITE_CLI_NO_SKILLS_NOTIFIER=1', cli, ...args]).catch(fail)
  const text = await run('auth', 'status')
  const status = parsed(AuthStatus, text.slice(text.indexOf('{')))
  if (!status) return fail(new SetupError('feishuNoApp'))
  if (status.identities.bot.status !== 'ready') fail(new SetupError('feishuBotNotReady', { app: status.appId, status: status.identities.bot.status }))
  const mode = /strict-mode:\s*(\w+)/.exec(await run('config', 'strict-mode'))?.[1]
  if (mode !== 'bot') fail(new SetupError('feishuUserIdentity', { mode: mode ?? 'unknown' }))
  // `--format json` unwraps only `data`, whereas this endpoint returns the payload under `bot`.
  const info = parsed(BotInfo, (await run('api', 'GET', '/open-apis/bot/v3/info', '--as', 'bot', '--format', 'ndjson')).split('\n')[0] ?? '')
  if (!info) return fail(new SetupError('feishuNoBot'))
  return { cli, appId: status.appId, brand: status.brand, botId: info.bot.open_id, name: info.bot.app_name }
}
