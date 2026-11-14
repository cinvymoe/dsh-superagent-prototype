/**
 * The plugin catalog of the three Agent roles: the built-in capability groups, the required core tools a role keeps, the
 * tools an enabled plugin adds, the catalog `GET settings` offers, and the checks a save of the `agents` settings block runs.
 */
import { UserError } from '../core/index.ts'
import { AGENT_ROLES, type AgentPlugin, type AgentRole, type AgentsConfig } from '../policy.ts'

/** The agent presets Executor Sessions and the main Session are created with, which the bundle's patch defines. */
export const WORKER_PRESET = 'dsh-superagent-worker', ROUTER_PRESET = 'dsh-superagent-router'
/**
 * The DSH tools an Executor Session works with, in catalog order: files, search, the shell and its jobs, the web, skills, its
 * todo list and subagents. It gets no other tool the profile has, whenever it was registered: none that asks or shows a person
 * something, changes the profile, schedules work or starts goals outside the worker slots, the pause and a person's hold,
 * starts or messages other Sessions, or edits documents.
 */
export const WORK_TOOLS = ['read', 'write', 'edit', 'read_image', 'glob', 'grep', 'bash', 'pwsh', 'job_output', 'job_list', 'job_kill', 'web_search',
  'web_fetch', 'skill', 'todo_write', 'subagent', 'list_subagent_models', 'send_message', 'list_agents', 'interrupt_agent']
/** The DSH tools the main Session works with, in catalog order: skills, files, the shell and its jobs, and images. */
export const MAIN_TOOLS = ['skill', 'bash', 'read', 'read_image', 'job_output', 'job_list', 'job_kill']
/**
 * billion-context's ACP compression tools, which the main Session gets from the `billion-context` plugin whenever the host
 * provides it; a host without the plugin leaves them out, and enabling or disabling the plugin is the only switch.
 */
export const COMPRESSION_TOOLS = ['compress', 'decompress', 'search_context', 'acp_status', 'acp_cache', 'acp_read_original_image']
/**
 * The tools a role cannot turn off: they are not part of any plugin, appear in its read-only required row, and stay in the
 * allow list whenever the host provides them. `skill` is required on the main Session but comes from the `skills` plugin on a
 * worker, and both platform shells are required on a worker while a host registers only its own.
 */
export const REQUIRED_TOOLS: Readonly<Record<AgentRole, readonly string[]>> = {
  main: ['skill', 'bash', 'read', 'job_output', 'job_list', 'job_kill'],
  aligner: ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'pwsh', 'job_output', 'job_list', 'job_kill'],
  executor: ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'pwsh', 'job_output', 'job_list', 'job_kill'],
}
/**
 * A built-in plugin's definition: its tools, the roles it applies to, and where its tools come from. A `preset` group's
 * tools are registered by the bundle's own agent presets, so they are available whenever those presets run; a `host`
 * group's tools come from an installed host plugin and are checked against the host's global registry.
 */
export interface BuiltinPlugin extends AgentPlugin { roles: AgentRole[]; providedBy: 'preset' | 'host' }
/**
 * The built-in plugin groups, whose defaults reproduce the per-tool catalog they replace: `image` and `billion-context` on
 * the main Session, and `image`, `web`, `skills`, `todo` and `subagents` on a worker. They stay code-owned: a save cannot add,
 * remove or edit them, only enable or disable one for a role it applies to.
 */
export const BUILTIN_PLUGINS: readonly BuiltinPlugin[] = [
  { id: 'image', name: 'Image', description: 'Read an image file from the workspace.', tools: ['read_image'], roles: [...AGENT_ROLES],
    providedBy: 'preset' },
  { id: 'web', name: 'Web', description: 'Search the web and fetch a page.', tools: ['web_search', 'web_fetch'], roles: ['aligner', 'executor'],
    providedBy: 'preset' },
  { id: 'skills', name: 'Skills', description: 'Load a skill by name.', tools: ['skill'], roles: ['aligner', 'executor'], providedBy: 'preset' },
  { id: 'todo', name: 'Todo', description: 'Keep a todo list across the turn.', tools: ['todo_write'], roles: ['aligner', 'executor'],
    providedBy: 'preset' },
  { id: 'subagents', name: 'Subagents', description: 'Start and message other agents.', roles: ['aligner', 'executor'],
    tools: ['subagent', 'list_subagent_models', 'send_message', 'list_agents', 'interrupt_agent'], providedBy: 'preset' },
  { id: 'billion-context', name: 'Billion Context', description: 'Compress the Session context with the ACP compression tools.',
    tools: [...COMPRESSION_TOOLS], roles: ['main'], providedBy: 'host' },
]
/** One role's configurable tool surface: the preset it runs under and the tools it cannot turn off. */
export interface AgentTools { preset: string; required: readonly string[] }
/** A tool the host registered globally, with the description it shows for it; a stored plugin may declare one. */
export interface RegisteredTool { name: string; description: string }
/** One plugin as `GET settings` offers it: its definition, whether code owns it, its role scope, and the tools this host lacks. */
export interface AgentPluginCatalog extends AgentPlugin {
  roles: AgentRole[]; builtIn: boolean; provided: boolean; missingTools: string[]
}
/** One role's catalog as `GET settings` offers it: the required tools, the applicable plugins, and the enabled ones. */
export interface AgentRoleCatalog {
  role: AgentRole; preset: string; required: string[]; plugins: string[]; enabledPlugins: string[]
}
/** One group of host tools the panel offers to save as a plugin: an MCP server's tools or a shared tool-name prefix. */
export interface PluginSuggestion {
  /** The MCP server name, or the prefix at least two tools share; the panel prefills a plugin name from it. */
  name: string
  kind: 'mcp' | 'family'
  tools: { name: string; description: string }[]
}
/**
 * The whole Agents catalog: the shared plugins (built-in and stored), each role's scope, the host-tool groups a person may
 * save as a plugin, the tools that belong to no group, and every tool name this host registers.
 */
export interface AgentsCatalog {
  plugins: AgentPluginCatalog[]; roles: AgentRoleCatalog[]; suggestions: PluginSuggestion[]
  ungroupedTools: { name: string; description: string }[]; availableTools: string[]
}
/**
 * Tools a stored plugin can never declare, however a plugin registers them: none that asks or shows a person something
 * (`ask_user_question`, `answer`, `present`), changes settings, the profile, plugins or prompts
 * (`orchestrator_settings_save`, `orchestrator_prompts_save`), schedules work or starts goals outside the worker slots
 * (`schedule_create`, `schedule_edit`, `create_goal`, `update_goal`, `ralph`), starts, waits for, stops or messages other
 * Sessions and teams (`spawn_teammate`, `wait_agent`, `team_task_create`, `team_task_update`), or is the reserved PTC
 * transport a Session gets through its presentation mode (`run_code`).
 */
export const FORBIDDEN_ADDED_TOOLS: readonly string[] = ['ask_user_question', 'answer', 'present', 'orchestrator_settings_save',
  'orchestrator_prompts_save', 'schedule_create', 'schedule_edit', 'create_goal', 'update_goal', 'ralph', 'spawn_teammate',
  'wait_agent', 'team_task_create', 'team_task_update', 'run_code']
/** Whether a stored plugin's declared tool is on the forbidden list. */
export const forbiddenAddedTool = (name: string): boolean => FORBIDDEN_ADDED_TOOLS.includes(name)
/** Each role's preset; the built-in plugin definitions above hold the tools, so a role only keeps its preset and required tools. */
export const AGENT_TOOLS: Readonly<Record<AgentRole, AgentTools>> = {
  main: { preset: ROUTER_PRESET, required: REQUIRED_TOOLS.main },
  aligner: { preset: WORKER_PRESET, required: REQUIRED_TOOLS.aligner },
  executor: { preset: WORKER_PRESET, required: REQUIRED_TOOLS.executor },
}
/** Whether a plugin's definition applies to `role`; an absent `roles` means every role. */
export function pluginApplies(plugin: Pick<AgentPlugin, 'roles'>, role: AgentRole): boolean {
  return plugin.roles === undefined || plugin.roles.includes(role)
}
/** Every plugin a role can enable: the built-in groups first, then the stored ones, in catalog order. */
export function rolePlugins(role: AgentRole, agents: AgentsConfig): AgentPlugin[] {
  return [...BUILTIN_PLUGINS, ...agents.plugins].filter(plugin => pluginApplies(plugin, role))
}
/** The plugin a role's enabled id names, or undefined when this block knows no such plugin or it does not apply to the role. */
export function pluginOf(role: AgentRole, agents: AgentsConfig, id: string): AgentPlugin | undefined {
  return [...BUILTIN_PLUGINS, ...agents.plugins].find(plugin => plugin.id === id && pluginApplies(plugin, role))
}
/** The plugins a role enables, resolved in the order the block lists them, skipping unknown and inapplicable ids at run time. */
export function enabledPluginDefs(role: AgentRole, agents: AgentsConfig): AgentPlugin[] {
  const seen = new Set<string>()
  return agents[role].enabledPlugins.flatMap(id => {
    if (seen.has(id)) return []
    const plugin = pluginOf(role, agents, id)
    if (!plugin) return []
    seen.add(id)
    return [plugin]
  })
}
/** A role's catalog order: the main Session's built-ins, else the work tools, which keeps a Session's allow list stable. */
export function orderedTools(role: AgentRole): readonly string[] {
  return role === 'main' ? MAIN_TOOLS : WORK_TOOLS
}
/**
 * The tools a role may call: its required core tools, then the tools of the plugins it enables, deduplicated and kept in the
 * role's catalog order, with a tool a stored plugin declares outside that order appended in plugin order. A same-named tool
 * from two plugins is named once. `addedTools` no longer exists, so a save can only change this list by enabling a plugin.
 */
export function roleTools(role: AgentRole, agents: AgentsConfig): string[] {
  const allowed = new Set(REQUIRED_TOOLS[role])
  const extra: string[] = []
  for (const plugin of enabledPluginDefs(role, agents)) {
    for (const tool of plugin.tools) {
      if (allowed.has(tool)) continue
      allowed.add(tool)
      if (!orderedTools(role).includes(tool)) extra.push(tool)
    }
  }
  return [...orderedTools(role).filter(name => allowed.has(name)), ...extra]
}
/**
 * The host's registered tools that no catalog plugin declares, leaving out required, built-in and forbidden names and
 * repeated registrations. Both the suggestion groups and the ungrouped list are drawn from this set.
 */
function candidateTools(agents: AgentsConfig, registered: readonly RegisteredTool[]): { name: string; description: string }[] {
  const pluginTools = new Set([...BUILTIN_PLUGINS, ...agents.plugins].flatMap(plugin => plugin.tools))
  const builtInTools = new Set(AGENT_ROLES.flatMap(role => REQUIRED_TOOLS[role]))
  const seen = new Set<string>()
  return registered.filter(tool => {
    if (!tool.name || pluginTools.has(tool.name) || builtInTools.has(tool.name) || forbiddenAddedTool(tool.name) || seen.has(tool.name)) return false
    seen.add(tool.name)
    return true
  }).map(({ name, description }) => ({ name, description }))
}
const byName = (a: { name: string }, b: { name: string }): number => a.name < b.name ? -1 : a.name > b.name ? 1 : 0
/** The `mcp__<server>__<tool>` names DSH's MCP client gives a server's tools; the middle group is the server. */
const MCP_TOOL = /^mcp__(.+?)__(.+)$/
/**
 * The groups the panel offers to turn into a plugin, from the host's tools no catalog plugin declares: each MCP server
 * (`mcp__<server>__…`), then each tool-name prefix at least two tools share, each in name order. A tool with no such group
 * is offered on its own so a person can still put it in a plugin. A suggestion only prefills the form; a save stores what
 * the person confirms, and a tool this host later stops registering stays in the stored plugin but never in an allow list.
 */
export function pluginSuggestions(agents: AgentsConfig, registered: readonly RegisteredTool[] = []):
{ suggestions: PluginSuggestion[]; ungroupedTools: { name: string; description: string }[] } {
  const mcp = new Map<string, { name: string; description: string }[]>()
  const families = new Map<string, { name: string; description: string }[]>()
  const ungrouped: { name: string; description: string }[] = []
  const push = (group: Map<string, { name: string; description: string }[]>, key: string,
    tool: { name: string; description: string }) => {
    const tools = group.get(key)
    if (tools) tools.push(tool); else group.set(key, [tool])
  }
  const candidates = candidateTools(agents, registered)
  const prefixes = new Map<string, number>()
  const prefixesOf = (name: string) => {
    const parts = name.split('_')
    return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('_'))
  }
  for (const tool of candidates) for (const prefix of prefixesOf(tool.name)) prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1)
  for (const tool of candidates) {
    const match = MCP_TOOL.exec(tool.name)
    if (match) { push(mcp, match[1]!, tool); continue }
    // The most specific prefix another tool shares, so `feature_exec_*` stays one family rather than splitting on a
    // later segment; a tool with no shared prefix is offered on its own.
    const shared = prefixesOf(tool.name).filter(prefix => (prefixes.get(prefix) ?? 0) > 1)
    const family = shared.at(-1)
    if (family) push(families, family, tool); else ungrouped.push(tool)
  }
  const suggestions: PluginSuggestion[] = [
    ...[...mcp.keys()].sort().map(name => ({ name, kind: 'mcp' as const, tools: [...mcp.get(name)!].sort(byName) })),
    ...[...families.keys()].filter(prefix => families.get(prefix)!.length > 1).sort()
      .map(name => ({ name, kind: 'family' as const, tools: [...families.get(name)!].sort(byName) })),
  ]
  return { suggestions, ungroupedTools: ungrouped.sort(byName) }
}
/**
 * The catalog `GET settings` offers: the shared plugin definitions with the tools this host lacks, each role's required tools,
 * applicable and enabled plugin ids, the groups a person may save as a plugin, the tools that belong to no group, and every
 * tool name the host registers so the panel can mark a declared tool it lacks.
 */
export function agentCatalog(agents: AgentsConfig, registered: readonly RegisteredTool[] = []): AgentsCatalog {
  const available = new Set(registered.map(tool => tool.name))
  const { suggestions, ungroupedTools } = pluginSuggestions(agents, registered)
  const plugins = [...BUILTIN_PLUGINS, ...agents.plugins].map(plugin => {
    const builtIn = BUILTIN_PLUGINS.find(item => item.id === plugin.id)
    const tools = [...new Set(plugin.tools)]
    // The bundle's presets always register their own groups; only a host plugin's or a stored plugin's tools can be missing.
    const missingTools = builtIn?.providedBy === 'preset' ? [] : tools.filter(name => !available.has(name))
    return { ...plugin, tools, roles: plugin.roles ?? [...AGENT_ROLES], builtIn: builtIn !== undefined,
      provided: missingTools.length === 0, missingTools }
  })
  return {
    plugins,
    roles: AGENT_ROLES.map(role => ({ role, preset: AGENT_TOOLS[role].preset, required: [...REQUIRED_TOOLS[role]],
      plugins: plugins.filter(plugin => plugin.roles.includes(role)).map(plugin => plugin.id),
      enabledPlugins: [...agents[role].enabledPlugins] })),
    suggestions,
    ungroupedTools,
    availableTools: [...available].sort(),
  }
}
/**
 * Refuse a save whose plugin catalog or role enable list cannot mean what it says: a stored plugin repeats a built-in or
 * another stored id, declares no tool, declares a forbidden or required tool, or a role enables an unknown or inapplicable
 * plugin. Reading stays lenient, so a stored name the catalog or host later dropped is accepted until the block is saved.
 * @throws UserError (`agentsDuplicatePlugin`), (`agentsEmptyPlugin`), (`agentsPluginForbiddenTool`),
 * (`agentsPluginRequiredTool`), then (`agentsUnknownPlugin`) and (`agentsPluginRole`) per role.
 */
export function validateAgentPlugins(agents: AgentsConfig): void {
  const builtIn = new Set(BUILTIN_PLUGINS.map(plugin => plugin.id))
  const seen = new Set<string>()
  for (const plugin of agents.plugins) {
    // A stored definition cannot shadow a built-in group or another stored one.
    if (builtIn.has(plugin.id) || seen.has(plugin.id)) throw new UserError('agentsDuplicatePlugin', { plugin: plugin.id })
    seen.add(plugin.id)
    if (plugin.tools.length === 0) throw new UserError('agentsEmptyPlugin', { plugin: plugin.id })
    const forbidden = plugin.tools.filter(forbiddenAddedTool)
    if (forbidden.length > 0) throw new UserError('agentsPluginForbiddenTool', { plugin: plugin.id, tools: forbidden.join(', ') })
    const roles = plugin.roles ?? [...AGENT_ROLES]
    const required = roles.flatMap(role => REQUIRED_TOOLS[role].filter(name => plugin.tools.includes(name)).map(name => `${role}: ${name}`))
    if (required.length > 0) throw new UserError('agentsPluginRequiredTool', { plugin: plugin.id, tools: required.join(', ') })
  }
  const known = (id: string) => builtIn.has(id) || agents.plugins.some(plugin => plugin.id === id)
  const plugin = (id: string) => [...BUILTIN_PLUGINS, ...agents.plugins].find(item => item.id === id)
  for (const role of AGENT_ROLES) {
    const ids = [...new Set(agents[role].enabledPlugins)]
    const unknown = ids.filter(id => !known(id))
    if (unknown.length > 0) throw new UserError('agentsUnknownPlugin', { role, plugins: unknown.join(', ') })
    const inapplicable = ids.filter(id => !pluginApplies(plugin(id)!, role))
    if (inapplicable.length > 0) throw new UserError('agentsPluginRole', { role, plugins: inapplicable.join(', ') })
  }
}
