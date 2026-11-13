/**
 * The tool catalog of the three Agent roles: the presets their Sessions run under, the tools a person cannot turn off,
 * the optional ones they may, the host's other global tools they may add, and the check a save of the `agents` settings
 * block runs.
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
/** A tool the host registered globally, with the description it shows for it; a role may have it added to its catalog. */
export interface RegisteredTool { name: string; description: string }
/** One role's catalog as `GET settings` offers it: the built-in tools and the host's global ones outside both sets above. */
export interface AgentCatalog {
  role: AgentRole; preset: string; required: string[]; optional: string[]
  addableTools: { name: string; description: string }[]
}
/**
 * Tools a role can never add, however a plugin registers them: none that asks or shows a person something
 * (`ask_user_question`, `answer`, `present`), changes settings, the profile, plugins or prompts
 * (`orchestrator_settings_save`, `orchestrator_prompts_save`), schedules work or starts goals outside the worker slots
 * (`schedule_create`, `schedule_edit`, `create_goal`, `update_goal`, `ralph`), starts, waits for, stops or messages other
 * Sessions and teams (`spawn_teammate`, `wait_agent`, `team_task_create`, `team_task_update`), or is the reserved PTC
 * transport a Session gets through its presentation mode (`run_code`). `list_agents`, `send_message` and
 * `interrupt_agent` stay out of this list because they are already built-in optional tools a person turns off instead.
 */
export const FORBIDDEN_ADDED_TOOLS: readonly string[] = ['ask_user_question', 'answer', 'present', 'orchestrator_settings_save',
  'orchestrator_prompts_save', 'schedule_create', 'schedule_edit', 'create_goal', 'update_goal', 'ralph', 'spawn_teammate',
  'wait_agent', 'team_task_create', 'team_task_update', 'run_code']
/** Whether a registered tool's name stays out of every role's addable catalog. */
export const forbiddenAddedTool = (name: string): boolean => FORBIDDEN_ADDED_TOOLS.includes(name)
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
/** The catalog `GET settings` offers, in role order; without a host tool registry every role's addable list is empty. */
export function agentCatalog(registered: readonly RegisteredTool[] = []): AgentCatalog[] {
  return AGENT_ROLES.map(role => ({ role, preset: AGENT_TOOLS[role].preset, required: [...AGENT_TOOLS[role].required],
    optional: [...AGENT_TOOLS[role].optional], addableTools: addableTools(role, registered) }))
}
/**
 * The host's global tools one role may add: those outside its built-in catalog, the forbidden list, and repeated names,
 * each with the host's description, sorted by name so a catalog reads the same on every request.
 */
export function addableTools(role: AgentRole, registered: readonly RegisteredTool[]): { name: string; description: string }[] {
  const builtIn = new Set([...AGENT_TOOLS[role].required, ...AGENT_TOOLS[role].optional])
  const seen = new Set<string>()
  return registered.filter(tool => {
    if (!tool.name || builtIn.has(tool.name) || forbiddenAddedTool(tool.name) || seen.has(tool.name)) return false
    seen.add(tool.name)
    return true
  }).map(({ name, description }) => ({ name, description }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
}
/** A role's catalog order: the main Session's built-ins, else the work tools, which keeps a Session's allow list stable. */
export function orderedTools(role: AgentRole): readonly string[] {
  return role === 'main' ? MAIN_TOOLS : WORK_TOOLS
}
/**
 * The optional tools a role's stored configuration turns off. Reading stays lenient at run time: a name outside the role's
 * current optional catalog, such as a retired tool or one of its required tools, is ignored instead of narrowing the list.
 */
export function turnedOff(role: AgentRole, agents: AgentsConfig): ReadonlySet<string> {
  const optional = new Set(AGENT_TOOLS[role].optional)
  return new Set(agents[role].disabledTools.filter(name => optional.has(name)))
}
/**
 * The tools a role may call: its catalog in catalog order, with the optional tools a person turned off removed, then the
 * extra tools a person added beyond the catalog in saved order. A name the catalog already has stays in its catalog position,
 * so an added tool never appears twice; the host's availability is checked by the Session that installs the allow list, as a
 * plugin may be uninstalled after the save.
 */
export function roleTools(role: AgentRole, agents: AgentsConfig): string[] {
  const off = turnedOff(role, agents)
  const catalog = orderedTools(role).filter(name => !off.has(name))
  const added = [...new Set(agents[role].addedTools ?? [])].filter(name => !catalog.includes(name))
  return [...catalog, ...added]
}
/**
 * Refuse a save that turns off a required tool or names a tool the role does not have, and refuse an added tool that is
 * built in, forbidden, or that the host has not registered.
 * @throws UserError (`agentsUnknownTool`) for a role's names outside its catalog, then (`agentsRequiredTool`) for its
 * required ones, then (`agentsBuiltInTool`), (`agentsForbiddenTool`) and (`agentsUnknownAddedTool`) for its added tools.
 */
export function validateAgentTools(agents: AgentsConfig, registered: readonly RegisteredTool[] = []): void {
  const available = new Set(registered.map(tool => tool.name))
  for (const role of AGENT_ROLES) {
    const { required, optional } = AGENT_TOOLS[role]
    const known = new Set([...required, ...optional])
    const disabled = agents[role].disabledTools
    const unknown = disabled.filter(name => !known.has(name))
    if (unknown.length > 0) throw new UserError('agentsUnknownTool', { role, tools: unknown.join(', ') })
    const blocked = disabled.filter(name => required.includes(name))
    if (blocked.length > 0) throw new UserError('agentsRequiredTool', { role, tools: blocked.join(', ') })
    const added = agents[role].addedTools
    const builtIn = added.filter(name => known.has(name))
    if (builtIn.length > 0) throw new UserError('agentsBuiltInTool', { role, tools: builtIn.join(', ') })
    const forbidden = added.filter(name => forbiddenAddedTool(name))
    if (forbidden.length > 0) throw new UserError('agentsForbiddenTool', { role, tools: forbidden.join(', ') })
    const missing = added.filter(name => !available.has(name))
    if (missing.length > 0) throw new UserError('agentsUnknownAddedTool', { role, tools: missing.join(', ') })
  }
}
