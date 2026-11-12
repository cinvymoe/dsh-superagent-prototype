/**
 * The tool catalog of the three Agent roles: the presets their Sessions run under, the tools a person cannot turn off and
 * the optional ones they may, and the check a save of the `agents` settings block runs.
 */
import { UserError } from '../core/index.ts'
import { AGENT_ROLES, type AgentRole, type AgentsConfig } from '../policy.ts'

/** The agent presets Executor Sessions and the main Session are created with, which the bundle's patch defines. */
export const WORKER_PRESET = 'dsh-superagent-worker', ROUTER_PRESET = 'dsh-superagent-router'
/**
 * The DSH tools an Executor Session works with: files, search, the shell and its jobs, the web, skills, its todo list and
 * subagents. It gets no other tool the profile has, whenever it was registered: none that asks or shows a person something,
 * changes the profile, schedules work or starts goals outside the worker slots, the pause and a person's hold, starts or
 * messages other Sessions, or edits documents.
 */
export const WORK_TOOLS = ['read', 'write', 'edit', 'read_image', 'glob', 'grep', 'bash', 'pwsh', 'job_output', 'job_list', 'job_kill', 'web_search',
  'web_fetch', 'skill', 'todo_write', 'subagent', 'list_subagent_models', 'send_message', 'list_agents', 'interrupt_agent']
/** The DSH tools the main Session works with, in the order it gets them: skills, files, the shell and its jobs. */
export const MAIN_TOOLS = ['skill', 'bash', 'read', 'read_image', 'job_output', 'job_list', 'job_kill']
/**
 * billion-context's ACP compression tools, which the main Session may call whenever the host's compression plugin provides
 * them, so its context is compressed; a host without the plugin leaves them out and keeps `MAIN_TOOLS`.
 */
export const COMPRESSION_TOOLS = ['compress', 'decompress', 'search_context', 'acp_status', 'acp_cache', 'acp_read_original_image']

/** The tools an aligner and an executor Session cannot work without, so their roles cannot turn them off. */
const WORKER_REQUIRED = ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'job_output', 'job_list', 'job_kill']
/** One role's configurable tool catalog: the preset it runs under, the tools it cannot turn off, and those it may. */
export interface AgentTools { preset: string; required: readonly string[]; optional: readonly string[] }
/**
 * Each Agent role's catalog: the main Session keeps its own seven built-ins except `read_image`, an aligner and an executor
 * share the work tools, and subagents inherit their executor's optional tools without a catalog of their own. Compression
 * tools stay automatic and never enter the catalog, as a slice Ticket's execution tools do not.
 */
export const AGENT_TOOLS: Readonly<Record<AgentRole, AgentTools>> = {
  main: { preset: ROUTER_PRESET, required: MAIN_TOOLS.filter(name => name !== 'read_image'), optional: ['read_image'] },
  aligner: { preset: WORKER_PRESET, required: WORKER_REQUIRED, optional: WORK_TOOLS.filter(name => !WORKER_REQUIRED.includes(name)) },
  executor: { preset: WORKER_PRESET, required: WORKER_REQUIRED, optional: WORK_TOOLS.filter(name => !WORKER_REQUIRED.includes(name)) },
}
/** The catalog `GET settings` offers, in role order. */
export function agentCatalog(): { role: AgentRole; preset: string; required: string[]; optional: string[] }[] {
  return AGENT_ROLES.map(role => ({ role, preset: AGENT_TOOLS[role].preset, required: [...AGENT_TOOLS[role].required],
    optional: [...AGENT_TOOLS[role].optional] }))
}
/**
 * Refuse a save that turns off a required tool or names a tool the role does not have.
 * @throws UserError (`agentsUnknownTool`) for a role's names outside its catalog, then (`agentsRequiredTool`) for its required ones.
 */
export function validateAgentTools(agents: AgentsConfig): void {
  for (const role of AGENT_ROLES) {
    const { required, optional } = AGENT_TOOLS[role]
    const known = new Set([...required, ...optional])
    const disabled = agents[role].disabledTools
    const unknown = disabled.filter(name => !known.has(name))
    if (unknown.length > 0) throw new UserError('agentsUnknownTool', { role, tools: unknown.join(', ') })
    const blocked = disabled.filter(name => required.includes(name))
    if (blocked.length > 0) throw new UserError('agentsRequiredTool', { role, tools: blocked.join(', ') })
  }
}
