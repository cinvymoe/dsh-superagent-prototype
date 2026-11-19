/**
 * The Agent role registry: one spec per configured role, holding the preset it runs under, the tools it always keeps, the
 * plugins it starts with, and how its model, prompt, tool surface and concurrency slot are chosen. A consumer reads
 * `AGENT_SPECS[role]` instead of branching on a role name; adding a role that reuses an existing installer is a new entry
 * here, not a new branch in each consumer.
 */
import { roleModel } from '../agent-model.ts'
import type { ExecutionMode, Ticket } from '../core/index.ts'
import { DEFAULT_ENABLED_PLUGINS, type AgentRole, type RoleModel, type Settings } from '../policy.ts'
import type { Variable } from './execution-environment.ts'
import type { PromptConfig, Prompts } from './prompts.ts'

/** The presets the bundle's patch defines: the main Session's, and the one every Ticket Session and discussion Answerer runs under. */
export const ROUTER_PRESET = 'dsh-superagent-router', WORKER_PRESET = 'dsh-superagent-worker'
/**
 * How a role's tool surface is installed on its Session: the main Session's, an execution Ticket worker's, an alignment
 * Ticket aligner's read-only set, or a discussion Answerer's.
 */
export type AgentToolInstaller = 'main' | 'work' | 'align' | 'answer'
/**
 * A role's concurrency pool: execution Tickets share the executor's slots, alignment Tickets hold their own fixed pool, and
 * a discussion answer runs in its own, so none of the three waits behind another.
 */
export interface AgentSlot {
  pool: 'worker' | 'aligner' | 'answerer'
  /** How many Sessions of this pool run at once; a worker's follows the saved Execution limit. */
  limit(settings: Pick<Settings, 'executor'>): number
}
/** One prompt composition: the revision's configuration plus what the Session knows about its own work. */
export interface AgentPromptInput {
  /** The prompt revision's team sections and overrides, so every request composes the revision it started with. */
  config: PromptConfig
  /** The Ticket this Session works on; absent on the main Session. */
  ticket?: Ticket
  /** The strategy a planned slice pinned, already resolved; absent on every other Session. */
  strategy?: { mode: ExecutionMode }
  /** This Ticket's execution environment; absent before setup and on the main Session. */
  environment?: Variable[]
}
/** Compose one role's system prompt from the prompt revision and the Session's own facts. */
export type AgentPrompt = (prompts: Pick<Prompts, 'compose' | 'composeAlign' | 'composeDiscuss' | 'composeExecute'>,
  input: AgentPromptInput) => string
/** Everything the runtime branches on for one configured role. */
export interface AgentSpec {
  id: AgentRole
  /** The agent preset a Session of this role is created with. */
  preset: string
  /** The tools the role cannot turn off: not part of any plugin and always in its allow list. */
  required: readonly string[]
  /** The plugin ids a fresh `agents` block enables for the role. */
  defaultPlugins: readonly string[]
  /** The role's effective model for a new Session, or null for the profile default. */
  model(settings: Pick<Settings, 'agents' | 'eval' | 'executor'>): RoleModel | null
  /** The role's prompt for the current revision and Session. */
  prompt: AgentPrompt
  /** The installer that puts the role's tool surface on its Session. */
  tools: AgentToolInstaller
  /** The concurrency pool a Session of this role holds, or null for the one main Session. */
  slot: AgentSlot | null
}
/** The main Session's required core tools: the shell, reading and jobs it uses to route and watch. */
const MAIN_REQUIRED = ['skill', 'bash', 'read', 'job_output', 'job_list', 'job_kill'] as const
/** The tools a Ticket Session always keeps: work tools that come from no plugin. */
const WORK_REQUIRED = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'pwsh', 'job_output', 'job_list', 'job_kill'] as const
/** The tools an aligner always keeps: none of its reading tools comes from a plugin, so no switch can take one away. */
const ALIGN_REQUIRED = ['read', 'glob', 'grep'] as const
/** How many alignments are proposed at once; its own pool, so an aligner never waits for a worker slot. */
export const ALIGN_CONCURRENCY = 2
/** The aligner pool's fixed limit, which the registry states beside the worker pool. */
export const alignerSlotLimit = (): number => ALIGN_CONCURRENCY
/** How many discussions answer at once; separate from the worker slots, so a discussion never holds one. */
export const ANSWER_CONCURRENCY = 2
/** The answerer pool's fixed limit, which the registry states beside the worker pool. */
export const answerSlotLimit = (): number => ANSWER_CONCURRENCY
/** The worker pool's limit, read from the saved Execution setting as the executor has always read it. */
export const workerSlotLimit = (settings: Pick<Settings, 'executor'>): number => settings.executor.maxWorkers

/**
 * The four configured roles. Worker, Aligner and Answerer run the same preset, but differ in prompt, tool installer,
 * required tools, default plugins and slot: an execution Ticket runs a worker, an alignment Ticket an aligner that proposes
 * an alignment through a read-only tool set, and a discussion's Answerer answers questions in its own read-only pool.
 */
export const AGENT_SPECS: Readonly<Record<AgentRole, AgentSpec>> = {
  main: { id: 'main', preset: ROUTER_PRESET, required: MAIN_REQUIRED, defaultPlugins: DEFAULT_ENABLED_PLUGINS.main,
    model: settings => roleModel(settings, 'main'),
    prompt: (prompts, { config, environment }) => prompts.compose(config, 'orchestrator', environment),
    tools: 'main', slot: null },
  worker: { id: 'worker', preset: WORKER_PRESET, required: WORK_REQUIRED, defaultPlugins: DEFAULT_ENABLED_PLUGINS.worker,
    model: settings => roleModel(settings, 'worker'),
    // An execution Ticket reads the worker rules, or, when its plan pinned a strategy, that strategy's execution guide.
    prompt: (prompts, { config, strategy, environment }) => strategy
      ? prompts.composeExecute(config, strategy.mode, environment) : prompts.compose(config, 'worker', environment),
    tools: 'work', slot: { pool: 'worker', limit: workerSlotLimit } },
  aligner: { id: 'aligner', preset: WORKER_PRESET, required: ALIGN_REQUIRED, defaultPlugins: DEFAULT_ENABLED_PLUGINS.aligner,
    model: settings => roleModel(settings, 'aligner'),
    // An alignment Ticket reads the shared rules and the alignment guide only: it proposes an alignment and implements
    // nothing, so it never reads the worker mandate, its handoff or the replies an execution Ticket owns.
    prompt: (prompts, { config, environment }) => prompts.composeAlign(config, environment),
    tools: 'align', slot: { pool: 'aligner', limit: alignerSlotLimit } },
  answerer: { id: 'answerer', preset: WORKER_PRESET, required: WORK_REQUIRED, defaultPlugins: DEFAULT_ENABLED_PLUGINS.answerer,
    model: settings => roleModel(settings, 'answerer'),
    // A discussion Answerer never works a Ticket, so it reads the discussion guide without a Ticket environment.
    prompt: (prompts, { config }) => prompts.composeDiscuss(config, []),
    tools: 'answer', slot: { pool: 'answerer', limit: answerSlotLimit } },
}

/** The spec of one role; every consumer indexes the registry through this helper so a lookup reads as a role. */
export function agentSpec(role: AgentRole): AgentSpec { return AGENT_SPECS[role] }
