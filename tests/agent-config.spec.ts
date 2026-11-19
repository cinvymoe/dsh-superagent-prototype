/**
 * The `agents` settings block: the built-in plugin catalog and each role's default tool surface, the settings view, saving
 * with plugin validation, the per-role history diff, and the read tolerance for names the catalog or host no longer has.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { AGENT_ROLES, AgentsConfigSchema, DEFAULT_AGENT_PLUGINS, DEFAULT_ENABLED_PLUGINS, SettingsSchema, type AgentRole, type AgentsConfig } from '../src/policy.ts'
import { AGENT_TOOLS, ALIGN_TOOLS, BUILTIN_PLUGINS, COMPRESSION_TOOLS, FORBIDDEN_ADDED_TOOLS, MAIN_TOOLS, REQUIRED_TOOLS, WORK_TOOLS,
  agentCatalog, capabilityMounts, closeAgentPlugins, closeAgentsPlugins, pluginSuggestions, roleTools, validateAgentPlugins } from '../src/app/agent-tools.ts'
import { roleModel } from '../src/app/role-models.ts'
import { UserError } from '../src/core/index.ts'
import { startRuntime, feishu, type Host } from './fixtures/host.ts'

let h: Host | undefined
afterEach(async () => { await h?.stop(); h = undefined })
const model = { provider: 'main-provider', model: 'main-model' }
const settingsOf = (agents: unknown) => SettingsSchema.parse({ agents }).agents
const emptyAgents = settingsOf({})
const roleOf = (agents: AgentsConfig, role: keyof AgentsConfig, enabledPlugins: string[]) =>
  settingsOf({ ...agents, [role]: { ...agents[role], enabledPlugins } })
type RoleCatalog = { role: string; preset: string; required: string[]; plugins: string[]; enabledPlugins: string[] }
type PluginCatalog = { id: string; name: string; tools: string[]; roles: string[]; builtIn: boolean; provided: boolean; missingTools: string[] }
type SettingsBody = { blocks: { agents: { revision: number; value: AgentsConfig } }; agents: {
  roles: RoleCatalog[]; plugins: PluginCatalog[]; suggestions: { name: string; kind: string; tools: { name: string; description: string }[] }[]
  ungroupedTools: { name: string; description: string }[]; availableTools: string[] } }
type HistoryBody = { items: { block: string; changes: { code: string; items?: string[] }[] | null }[] }

it('catalogs each Agent role and the built-in plugin groups that reproduce the previous tool surface', () => {
  expect([...AGENT_ROLES]).toEqual(['main', 'worker', 'aligner', 'answerer'])
  expect(BUILTIN_PLUGINS.map(plugin => plugin.id)).toEqual(['image', 'web', 'skills', 'todo', 'subagents',
    'ask-user', 'present', 'web-fetch', 'fork-subagent'])
  expect(AGENT_TOOLS.main.preset).toBe('dsh-superagent-router')
  expect(AGENT_TOOLS.worker.preset).toBe('dsh-superagent-worker')
  expect(AGENT_TOOLS.aligner.preset).toBe('dsh-superagent-worker')
  expect(AGENT_TOOLS.answerer.preset).toBe('dsh-superagent-worker')
  expect([...AGENT_TOOLS.main.required]).toEqual(['skill', 'bash', 'read', 'job_output', 'job_list', 'job_kill'])
  expect([...AGENT_TOOLS.worker.required]).toEqual(REQUIRED_TOOLS.worker)
  // An aligner keeps the readers it needs and no optional group but image, so its surface stays read-only.
  expect([...AGENT_TOOLS.aligner.required]).toEqual(['read', 'glob', 'grep'])
  expect(roleTools('aligner', emptyAgents)).toEqual(ALIGN_TOOLS.filter(name => name !== 'orchestrator_read'
    && name !== 'orchestrator_align' && name !== 'orchestrator_report'))
  // An applicable plugin never declares a required tool of that role, so no switch can take one away.
  for (const role of AGENT_ROLES) {
    const applicable = BUILTIN_PLUGINS.filter(plugin => plugin.roles.includes(role))
    expect(REQUIRED_TOOLS[role].filter(name => applicable.some(plugin => plugin.tools.includes(name))), role).toEqual([])
  }
  // A new database starts on the plugin defaults that reproduce the per-tool surface it replaced.
  expect(emptyAgents.main.enabledPlugins).toEqual(['image', 'billion-context'])
  expect(emptyAgents.worker.enabledPlugins).toEqual(['image', 'web', 'skills', 'todo', 'subagents', 'billion-context'])
  expect(emptyAgents.aligner.enabledPlugins).toEqual(['image'])
  expect(emptyAgents.answerer.enabledPlugins).toEqual(DEFAULT_ENABLED_PLUGINS.answerer)
  // billion-context is a stored definition now, so a fresh block seeds it and the panel may edit or remove it.
  expect(emptyAgents.plugins).toEqual(DEFAULT_AGENT_PLUGINS.map(plugin => ({ ...plugin, tools: [...plugin.tools] })))
})

it('seeds billion-context as an editable stored plugin that the main role and a worker can enable', () => {
  const seeded = emptyAgents.plugins.find(plugin => plugin.id === 'billion-context')!
  // A worker enables it so a long-lived Executor can fold its own history, which this host's refusal of native compaction
  // leaves it no other way to do; the Answerer stays out, its runtime whitelist keeping the read-only tools only.
  expect(seeded).toMatchObject({ roles: ['main', 'worker'], tools: COMPRESSION_TOOLS })
  // The catalog marks it stored rather than code-owned, still reports the host's six compression tools for it, and offers it
  // to the main role alone.
  const catalog = agentCatalog(emptyAgents, [...MAIN_TOOLS, ...COMPRESSION_TOOLS].map(name => ({ name, description: '' })))
  expect(catalog.plugins.find(plugin => plugin.id === 'billion-context')).toMatchObject({ builtIn: false, provided: true, missingTools: [] })
  expect(catalog.roles.find(role => role.role === 'worker')!.plugins).toContain('billion-context')
  expect(catalog.roles.find(role => role.role === 'answerer')!.plugins).not.toContain('billion-context')
  // A config that never enables it keeps no definition, so a person may delete it and it stays deleted.
  const without = closeAgentsPlugins(settingsOf({ ...emptyAgents, plugins: [],
    main: { ...emptyAgents.main, enabledPlugins: ['image'] },
    worker: { ...emptyAgents.worker, enabledPlugins: ['image', 'web', 'skills', 'todo', 'subagents'] } }))
  expect(without.plugins).toEqual([])
})

it('reproduces the work tool set of every role from the default plugin list, widening the worker by compression', () => {
  // The main Session keeps its seven built-ins plus billion-context's six compression tools, in the order it always got them.
  expect(roleTools('main', emptyAgents)).toEqual([...MAIN_TOOLS, ...COMPRESSION_TOOLS])
  expect(new Set(roleTools('main', emptyAgents))).toEqual(new Set([...MAIN_TOOLS, ...COMPRESSION_TOOLS]))
  // The worker keeps the work tool set in catalog order and appends the compression tools it now enables; the Answerer,
  // which starts from the same plugins, keeps the work set alone and loses the rest to its read-only whitelist at runtime.
  expect(roleTools('worker', emptyAgents)).toEqual([...WORK_TOOLS, ...COMPRESSION_TOOLS])
  expect(roleTools('answerer', emptyAgents)).toEqual(WORK_TOOLS)
  // The built-in groups together account for every optional tool; nothing was lost in the move from per-tool switches.
  // The runtime-mounted capabilities add tools these presets never register, so they stay out of that accounting.
  expect(new Set([...BUILTIN_PLUGINS.filter(plugin => plugin.providedBy !== 'mount'), ...emptyAgents.plugins].flatMap(plugin => plugin.tools)))
    .toEqual(new Set([...WORK_TOOLS.filter(name => !REQUIRED_TOOLS.worker.includes(name)), ...COMPRESSION_TOOLS]))
})

it('mounts the capability plugins a role enables with the configuration each module needs, never as allow-list names', () => {
  const withCapabilities = roleOf(emptyAgents, 'worker', [...emptyAgents.worker.enabledPlugins,
    'ask-user', 'present', 'web-fetch', 'fork-subagent'])
  // Nothing is mounted until someone enables it, so the default surface stays exactly as it was.
  expect(capabilityMounts('worker', emptyAgents)).toEqual([])
  // A module is mounted once per Session, in the catalog order the role saved, and the forked subagent runs on the same
  // preset as the Session that starts it.
  expect(capabilityMounts('worker', withCapabilities)).toEqual([
    { id: 'ask-user', module: '@deepseek-ai/dsh-tool-ask-user', config: { mode: 'timed', timeout: 120 } },
    { id: 'present', module: '@deepseek-ai/dsh-tool-present', config: {} },
    { id: 'web-fetch', module: '@deepseek-ai/dsh-tool-web', config: { search: false, fetch: true } },
    { id: 'fork-subagent', module: '@deepseek-ai/dsh-tool-subagent',
      config: { provider: 'fork', toolName: 'subagent_fork', agentPreset: AGENT_TOOLS.worker.preset } },
  ])
  // The main Session is a person's Session, so it asks and can block; a worker asks on a timeout instead.
  expect(capabilityMounts('main', roleOf(emptyAgents, 'main', [...emptyAgents.main.enabledPlugins, 'ask-user'])))
    .toEqual([{ id: 'ask-user', module: '@deepseek-ai/dsh-tool-ask-user', config: { mode: 'legacy' } }])
  // A capability never enters the allow list: its tools live in the Session's own scope, which `restrict` cannot mask.
  expect(roleTools('worker', withCapabilities)).toEqual([...WORK_TOOLS, ...COMPRESSION_TOOLS])
  // The catalog still marks it as provided and names its tools, so the panel can show what enabling it brings.
  const catalog = agentCatalog(withCapabilities, WORK_TOOLS.map(name => ({ name, description: '' })))
  expect(catalog.plugins.find(plugin => plugin.id === 'fork-subagent')).toMatchObject({ builtIn: true, provided: true,
    providedBy: 'mount', tools: ['subagent_fork'], missingTools: [] })
})

it('closes an enabled plugin over its declared dependencies when a block is saved', () => {
  const stored = { id: 'lint-plus', name: 'Lint plus', tools: ['plugin_lint'], requires: ['ask-user'], roles: ['worker'] as AgentRole[] }
  const drafted = AgentsConfigSchema.parse({ ...emptyAgents, plugins: [stored],
    worker: { ...emptyAgents.worker, enabledPlugins: [...emptyAgents.worker.enabledPlugins, 'lint-plus'] } })
  const agents = closeAgentsPlugins(drafted)
  // The save adds the dependency the plugin declares without adding it twice, and closing again changes nothing.
  // This block defines neither billion-context nor its own default, so the closure keeps the enabled id it cannot resolve
  // at the end rather than dropping it.
  expect(agents.worker.enabledPlugins)
    .toEqual(['image', 'web', 'skills', 'todo', 'subagents', 'ask-user', 'lint-plus', 'billion-context'])
  expect(closeAgentsPlugins(agents).worker.enabledPlugins).toEqual(agents.worker.enabledPlugins)
  // A dependency that does not apply to the same role cannot be pulled across, so such a save is refused.
  const mainOnly = { id: 'deps-main', name: 'Deps main', tools: ['plugin_lint'], roles: ['main'] as AgentRole[] }
  const crossRole = { ...stored, requires: ['deps-main'] }
  const refused = { ...emptyAgents, plugins: [...emptyAgents.plugins, mainOnly, crossRole],
    worker: { ...emptyAgents.worker, enabledPlugins: [...emptyAgents.worker.enabledPlugins, 'lint-plus'] } }
  expect(closeAgentPlugins('worker', refused))
    .toEqual(['image', 'web', 'skills', 'todo', 'subagents', 'billion-context', 'lint-plus'])
  expect(() => validateAgentPlugins(closeAgentsPlugins(AgentsConfigSchema.parse(refused))))
    .toThrow(expect.objectContaining({ code: 'agentsPluginRequires',
      values: expect.objectContaining({ role: 'worker', requires: 'lint-plus -> deps-main' }) }))
})

it('adds a plugin\'s tools, drops them when its switch is off, deduplicates names and keeps the catalog order', () => {
  // Enabling billion-context on the main Session appends exactly its six tools after the required ones and read_image.
  expect(roleTools('main', emptyAgents)).toEqual([...MAIN_TOOLS, ...COMPRESSION_TOOLS])
  const withoutCompression = roleOf(emptyAgents, 'main', ['image'])
  expect(roleTools('main', withoutCompression)).toEqual(MAIN_TOOLS)
  // Turning web off takes both of its tools and leaves the rest of the worker surface untouched.
  const withoutWeb = roleOf(emptyAgents, 'worker', ['image', 'skills', 'todo', 'subagents', 'billion-context'])
  expect(roleTools('worker', withoutWeb))
    .toEqual([...WORK_TOOLS.filter(name => name !== 'web_search' && name !== 'web_fetch'), ...COMPRESSION_TOOLS])
  const withoutImage = roleOf(emptyAgents, 'worker', ['web', 'skills', 'todo', 'subagents', 'billion-context'])
  expect(roleTools('worker', withoutImage)).not.toContain('read_image')
  // A stored plugin may repeat a tool another one declares, or a required one: it is named once, in catalog position.
  const extra = settingsOf({ ...emptyAgents, plugins: [{ id: 'extra', name: 'Extra', tools: ['plugin_lint', 'read_image', 'bash', 'web_search'] }],
    worker: { ...emptyAgents.worker, enabledPlugins: [...emptyAgents.worker.enabledPlugins, 'extra'] } })
  const tools = roleTools('worker', extra)
  expect(tools).toEqual([...WORK_TOOLS, ...COMPRESSION_TOOLS, 'plugin_lint'])
  expect(tools.filter(name => name === 'read_image')).toHaveLength(1)
  // Runtime reading stays lenient: an unknown or inapplicable plugin id contributes nothing rather than throwing.
  expect(roleTools('main', roleOf(emptyAgents, 'main', ['missing', 'web']))).toEqual(REQUIRED_TOOLS.main)
  expect(roleTools('worker', roleOf(emptyAgents, 'worker', ['billion-context']))).toEqual([...REQUIRED_TOOLS.worker, ...COMPRESSION_TOOLS])
})

it('resolves each role\'s model through its own override, then the role default, an Answerer following the worker', () => {
  const evalModel = { provider: 'eval-provider', model: 'eval-model' }
  const executionModel = { provider: 'execution-provider', model: 'execution-model' }
  const mainModel = { provider: 'main-provider', model: 'main-model' }
  const answererModel = { provider: 'answerer-provider', model: 'answerer-model' }
  const value = (agents: Record<string, unknown>) => SettingsSchema.parse({ eval: { model: evalModel }, executor: { model: executionModel }, agents })
  expect(roleModel(value({}), 'main')).toEqual(evalModel)
  expect(roleModel(value({ main: { model: mainModel } }), 'main')).toEqual(mainModel)
  expect(roleModel(value({}), 'worker')).toEqual(executionModel)
  expect(roleModel(value({ worker: { model: mainModel } }), 'worker')).toEqual(mainModel)
  // An Answerer with no override follows the worker's effective model, override or default.
  expect(roleModel(value({}), 'answerer')).toEqual(executionModel)
  expect(roleModel(value({ worker: { model: mainModel } }), 'answerer')).toEqual(mainModel)
  expect(roleModel(value({ answerer: { model: answererModel } }), 'answerer')).toEqual(answererModel)
})

it('applies each role\'s own model and switches: worker Tickets, the aligner\'s read-only surface and discussions', async () => {
  h = await startRuntime()
  const project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' })
  const issue = h.runtime.local.create({ title: 'Align the local board', body: 'Requirements arrive in the panel.', project: project.id })
  await h.runtime.idle()
  const workerModel = { provider: 'work-provider', model: 'work-model' }
  const answererModel = { provider: 'answer-provider', model: 'answer-model' }
  const value = settingsOf({ ...emptyAgents,
    worker: { model: workerModel, enabledPlugins: ['image', 'skills', 'todo', 'subagents'] },
    answerer: { model: answererModel, enabledPlugins: ['web', 'skills', 'todo', 'subagents'] } })
  expect(await h.api('PUT', 'settings/agents', { value, revision: 0 })).toMatchObject({ status: 200 })
  const llm = (h.ctx as unknown as { llm: { resolveCallConfig: ReturnType<typeof vi.fn> } }).llm
  llm.resolveCallConfig.mockClear()
  const triggerId = h.runtime.store.read.threadTriggers(`local:${issue.id}`, 1)[0]!.id
  // An alignment Ticket runs the aligner role: it still inherits the worker's model, but its tools are the read-only
  // aligner surface, so none of the worker's implementation switches reach it.
  const align = await h.route({ kind: 'accept', trigger_id: triggerId, title: 'Align the local board', worktree_name: 'align-local-board',
    acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  expect(llm.resolveCallConfig).toHaveBeenCalledWith(workerModel)
  expect(h.restrictions.get(`worker-${align.ticket.ticket_id}`)!.at(-1)).toEqual(ALIGN_TOOLS)
  // A discussion's Answerer uses its own model and switches: read-only, narrowed to its own plugins, no alignment tool.
  const discussion = h.runtime.discussions.create({ body: 'Discuss the split', project: project.id })
  const answerer = `answerer-${discussion.id}`
  await vi.waitFor(() => expect(h!.agents.get(answerer)?.status).toBe('running'))
  expect(llm.resolveCallConfig).toHaveBeenCalledWith(answererModel)
  const answererAllow = h.restrictions.get(answerer)!.at(-1)!
  expect(answererAllow).not.toContain('read_image')
  expect(answererAllow).toContain('read')
  expect(answererAllow).not.toContain('bash')
  expect(h.tools.get(answerer)!.has('orchestrator_align')).toBe(false)
  const work = await h.acceptedTicket(feishu('2', '@bot 修一下回归'))
  const workAllow = h.restrictions.get(work.sessionId)!.at(-1)!
  expect(workAllow).toContain('read_image')
  expect(workAllow).not.toContain('web_search')
})

it('returns the agents block with its revision, the shared plugin catalog and each role\'s plugin scope in GET settings', async () => {
  h = await startRuntime()
  const { status, body } = await h.api('GET', 'settings')
  expect(status).toBe(200)
  const settings = body as unknown as SettingsBody
  expect(settings.blocks.agents).toEqual({ revision: 0, value: emptyAgents })
  expect(settings.agents.roles.map(entry => entry.role)).toEqual(['main', 'worker', 'aligner', 'answerer'])
  expect(settings.agents.roles[0]).toMatchObject({ preset: 'dsh-superagent-router', required: REQUIRED_TOOLS.main,
    plugins: ['image', 'ask-user', 'present', 'web-fetch', 'fork-subagent', 'billion-context'],
    enabledPlugins: ['image', 'billion-context'] })
  expect(settings.agents.roles[1]).toMatchObject({ required: REQUIRED_TOOLS.worker,
    plugins: ['image', 'web', 'skills', 'todo', 'subagents', 'ask-user', 'present', 'web-fetch', 'fork-subagent', 'billion-context'] })
  // The aligner card: the worker preset, its three read-only required tools, and the image group as the only plugin.
  expect(settings.agents.roles[2]).toMatchObject({ role: 'aligner', preset: 'dsh-superagent-worker', required: REQUIRED_TOOLS.aligner,
    plugins: ['image'], enabledPlugins: ['image'] })
  expect(settings.agents.roles[3]).toMatchObject({ required: REQUIRED_TOOLS.answerer,
    plugins: ['image', 'web', 'skills', 'todo', 'subagents', 'ask-user', 'present', 'web-fetch', 'fork-subagent'] })
  // The shared catalog marks the built-in groups and the tools this host does not register.
  expect(settings.agents.plugins.map(plugin => [plugin.id, plugin.builtIn, plugin.provided]))
    .toEqual([['image', true, true], ['web', true, true], ['skills', true, true], ['todo', true, true],
      ['subagents', true, true], ['ask-user', true, true], ['present', true, true],
      ['web-fetch', true, true], ['fork-subagent', true, true], ['billion-context', false, false]])
  // The bundle's presets register their own groups and the runtime mounts the capability groups, so only a host plugin's
  // missing tools are reported.
  expect(settings.agents.plugins[1]!.missingTools).toEqual([])
  expect(settings.agents.plugins[9]!.missingTools).toEqual(COMPRESSION_TOOLS)
  // A capability group is offered to every role but is not enabled until someone switches it on, and it never enters the
  // tool allow list: the Session mounts it instead.
  expect(settings.agents.roles.map(entry => entry.plugins)).toEqual([
    ['image', 'ask-user', 'present', 'web-fetch', 'fork-subagent', 'billion-context'],
    ['image', 'web', 'skills', 'todo', 'subagents', 'ask-user', 'present', 'web-fetch', 'fork-subagent', 'billion-context'],
    ['image'],
    ['image', 'web', 'skills', 'todo', 'subagents', 'ask-user', 'present', 'web-fetch', 'fork-subagent']])
  expect(settings.agents.ungroupedTools).toEqual([])
})

it('offers the host\'s registered global tools that belong to no plugin as ungrouped, without built-in or forbidden names', async () => {
  h = await startRuntime()
  const plugin = { name: 'plugin_lint', description: 'Lint a plugin manifest' }
  h.globalTools.register(plugin)
  h.globalTools.register({ name: 'bash', description: 'Run a shell command' })
  h.globalTools.register({ name: 'web_search', description: 'Search the web' })
  h.globalTools.register({ name: FORBIDDEN_ADDED_TOOLS[0]!, description: 'Ask a person a question' })
  const settings = (await h.api('GET', 'settings')).body as unknown as SettingsBody
  expect(settings.agents.ungroupedTools).toEqual([plugin])
})

it('suggests an MCP server group and each shared tool-name prefix, leaving a lone tool ungrouped', () => {
  const agents = SettingsSchema.parse({}).agents
  const registered = [
    { name: 'mcp__magpie__repos', description: 'List repositories' },
    { name: 'mcp__magpie__call_tool', description: 'Call a tool' },
    { name: 'feature_exec_start', description: 'Start a flow' },
    { name: 'feature_exec_advance', description: 'Advance a flow' },
    { name: 'automation_create', description: 'Schedule work' },
    { name: 'automation_list', description: 'List schedules' },
    { name: 'plugin_lint', description: 'Lint a plugin manifest' },
    { name: 'agent_teams_status', description: 'Read a team' },
    { name: 'bash', description: 'A required tool' },
    { name: 'web_search', description: 'A built-in plugin tool' },
    { name: FORBIDDEN_ADDED_TOOLS[0]!, description: 'Ask a person a question' },
  ]
  const { suggestions, ungroupedTools } = pluginSuggestions(agents, registered)
  // MCP servers first, then tool families, each in name order and with its tools in name order.
  expect(suggestions).toEqual([
    { name: 'magpie', kind: 'mcp', tools: [{ name: 'mcp__magpie__call_tool', description: 'Call a tool' },
      { name: 'mcp__magpie__repos', description: 'List repositories' }] },
    { name: 'automation', kind: 'family', tools: [{ name: 'automation_create', description: 'Schedule work' },
      { name: 'automation_list', description: 'List schedules' }] },
    { name: 'feature_exec', kind: 'family', tools: [{ name: 'feature_exec_advance', description: 'Advance a flow' },
      { name: 'feature_exec_start', description: 'Start a flow' }] },
  ])
  // A one-word tool and a prefix with no sibling stay on their own; a built-in plugin tool, a required tool and a
  // forbidden name never appear in either list.
  expect(ungroupedTools).toEqual([{ name: 'agent_teams_status', description: 'Read a team' },
    { name: 'plugin_lint', description: 'Lint a plugin manifest' }])
})

it('saves a plugin declaring a tool the host does not register, and marks the tool missing instead of refusing it', async () => {
  h = await startRuntime()
  const { store } = h.runtime
  const ghost = { id: 'ghost', name: 'Ghost tools', tools: ['ghost_tool'] }
  const value = settingsOf({ ...emptyAgents, plugins: [ghost], worker: { ...emptyAgents.worker,
    enabledPlugins: [...emptyAgents.worker.enabledPlugins, 'ghost'] } })
  expect(await h.api('PUT', 'settings/agents', { value, revision: 0 })).toMatchObject({ status: 200, body: { saved: true } })
  const settings = (await h.api('GET', 'settings')).body as unknown as SettingsBody
  expect(settings.agents.plugins.find(plugin => plugin.id === 'ghost')).toMatchObject({ provided: false, missingTools: ['ghost_tool'] })
  expect(settings.agents.availableTools).not.toContain('ghost_tool')
  // The declaration stays in the role's configured surface; each Session drops it because the host cannot resolve it.
  expect(roleTools('worker', store.settings().agents)).toContain('ghost_tool')
  const history = (await h.api('GET', 'policy/history')).body as unknown as HistoryBody
  expect(history.items[0]!.changes).toEqual(expect.arrayContaining([{ code: 'agentPluginAdded', items: ['Ghost tools'] },
    { code: 'agentWorkerPluginEnabled', items: ['Ghost tools'] }]))
})

it('saves a valid plugin value, increments the block revision and diffs plugin enable, disable, add and remove', async () => {
  h = await startRuntime()
  const { store } = h.runtime
  const extra = { id: 'extra', name: 'Extra tools', tools: ['plugin_lint'] }
  const value = settingsOf({ ...emptyAgents, plugins: [extra],
    main: { model, enabledPlugins: ['image', 'extra', 'billion-context'] } })
  const saved = await h.api('PUT', 'settings/agents', { value, revision: 0 })
  expect(saved.status).toBe(200)
  expect(saved.body).toMatchObject({ saved: true, revision: 1, policy_changed: false, restarting: false })
  expect(store.blockRevision('agents')).toBe(1)
  expect(store.settings().agents).toEqual(value)
  expect((await h.api('GET', 'settings')).body.blocks).toMatchObject({ agents: { revision: 1, value } })
  const history = (await h.api('GET', 'policy/history')).body as unknown as HistoryBody
  expect(history.items[0]).toMatchObject({ block: 'agents' })
  expect(history.items[0]!.changes).toEqual(expect.arrayContaining([{ code: 'agentMainModel' },
    { code: 'agentMainPluginEnabled', items: ['Extra tools'] }, { code: 'agentPluginAdded', items: ['Extra tools'] }]))
  // Turning a built-in group off and removing the stored plugin words their own entries on the next save.
  const next = settingsOf({ ...value, plugins: [], main: { ...value.main, enabledPlugins: ['billion-context'] } })
  await h.runtime.settings.save('agents', next, store.blockRevision('agents'), 'panel')
  const after = (await h.api('GET', 'policy/history')).body as unknown as HistoryBody
  expect(after.items[0]!.changes).toEqual(expect.arrayContaining([{ code: 'agentMainPluginDisabled', items: ['Image', 'Extra tools'] },
    { code: 'agentPluginRemoved', items: ['Extra tools'] }]))
  expect(store.settings().agents).toEqual(next)
})

it('refuses an invalid plugin catalog or role scope on save with a localized error code', async () => {
  h = await startRuntime()
  const { store } = h.runtime
  const put = (agents: unknown) => h!.api('PUT', 'settings/agents', { value: agents, revision: store.blockRevision('agents') })
  const withPlugins = (plugins: unknown[], role: keyof AgentsConfig = 'worker', enabledPlugins = emptyAgents.worker.enabledPlugins) =>
    settingsOf({ ...emptyAgents, plugins, [role]: { ...emptyAgents[role], enabledPlugins } })
  const plugin = (over: Record<string, unknown>) => ({ id: 'extra', name: 'Extra', tools: ['plugin_lint'], ...over })
  expect(await put(withPlugins([plugin({}), plugin({})]))).toMatchObject({ status: 400,
    body: { code: 'agentsDuplicatePlugin', values: { plugin: 'extra' } } })
  expect(await put(withPlugins([plugin({ id: 'web' })]))).toMatchObject({ status: 400,
    body: { code: 'agentsDuplicatePlugin', values: { plugin: 'web' } } })
  expect(await put(withPlugins([plugin({ tools: [] })]))).toMatchObject({ status: 400,
    body: { code: 'agentsEmptyPlugin', values: { plugin: 'extra' } } })
  expect(await put(withPlugins([plugin({ tools: [FORBIDDEN_ADDED_TOOLS[0]!] })]))).toMatchObject({ status: 400,
    body: { code: 'agentsPluginForbiddenTool', values: { plugin: 'extra', tools: FORBIDDEN_ADDED_TOOLS[0]! } } })
  expect(await put(withPlugins([plugin({ tools: ['bash'] })]))).toMatchObject({ status: 400,
    body: { code: 'agentsPluginRequiredTool', values: { plugin: 'extra', tools: expect.stringContaining('bash') } } })
  // A role cannot name an unknown plugin, nor a known one that does not apply to it.
  expect(await put(settingsOf({ ...emptyAgents, worker: { ...emptyAgents.worker, enabledPlugins: ['missing'] } })))
    .toMatchObject({ status: 400, body: { code: 'agentsUnknownPlugin', values: { role: 'worker', plugins: 'missing' } } })
  expect(await put(settingsOf({ ...emptyAgents, main: { ...emptyAgents.main, enabledPlugins: ['web'] } })))
    .toMatchObject({ status: 400, body: { code: 'agentsPluginRole', values: { role: 'main', plugins: 'web' } } })
  expect(await put(settingsOf({ ...emptyAgents, answerer: { ...emptyAgents.answerer, enabledPlugins: ['billion-context'] } })))
    .toMatchObject({ status: 400, body: { code: 'agentsPluginRole', values: { role: 'answerer', plugins: 'billion-context' } } })
  // A role model the live provider cannot resolve is refused before anything is stored.
  const llm = (h.ctx as unknown as { llm: { resolveCallConfig: ReturnType<typeof vi.fn> } }).llm
  llm.resolveCallConfig.mockImplementationOnce(() => Promise.reject(new Error('no such model')))
  expect(await put(settingsOf({ ...emptyAgents, main: { model, enabledPlugins: emptyAgents.main.enabledPlugins } })))
    .toMatchObject({ status: 400, body: { code: 'modelUnavailable', values: { block: 'agents.main' } } })
  expect(store.settings().agents).toEqual(emptyAgents)
  // A plugin or model change reaches every Session of the role, so the main Session's tool cannot make one.
  await expect(h.runtime.settings.save('agents', withPlugins([plugin({})]), store.blockRevision('agents'), 'tool'))
    .rejects.toThrow(new UserError('panelOnlyAgents'))
  expect(store.settings().agents).toEqual(emptyAgents)
  expect(store.blockRevision('agents')).toBe(0)
})

it('still reads a plugin block that names a tool the host no longer registers, and refuses only its next save', async () => {
  h = await startRuntime(seeded => {
    const settings = seeded.settings()
    seeded.saveSettings({ ...settings, agents: { ...settings.agents,
      plugins: [{ id: 'imported-worker', name: 'Imported worker tools', tools: ['uninstalled_plugin_tool'], roles: ['worker'] }],
      worker: { ...settings.agents.worker, enabledPlugins: [...settings.agents.worker.enabledPlugins, 'imported-worker'] } } })
  })
  expect(h.runtime.store.settings().agents.plugins[0]!.tools).toEqual(['uninstalled_plugin_tool'])
  const settings = (await h.api('GET', 'settings')).body as unknown as SettingsBody
  expect(settings.blocks.agents.value.worker.enabledPlugins).toContain('imported-worker')
  expect(settings.agents.plugins.find(plugin => plugin.id === 'imported-worker')!.missingTools).toEqual(['uninstalled_plugin_tool'])
  // An old-style role block is no longer accepted: the migration converts it before a save can read it again.
  expect(AgentsConfigSchema.safeParse({ main: { disabledTools: [] } }).success).toBe(false)
})

it('validates plugin declarations and role scopes through the exported check', () => {
  const plugin = (over: Record<string, unknown>) => ({ id: 'extra', name: 'Extra', tools: ['plugin_lint'], ...over })
  const agents = (plugins: unknown[], role: keyof AgentsConfig = 'worker', enabledPlugins = [...emptyAgents.worker.enabledPlugins]) =>
    settingsOf({ ...emptyAgents, plugins, [role]: { ...emptyAgents[role], enabledPlugins } })
  expect(() => agentCatalog(agents([plugin({})]))).not.toThrow()
  // An unknown id or an inapplicable built-in group is refused only through a save, not while reading.
  expect(roleTools('main', agents([], 'main', ['web']))).toEqual(REQUIRED_TOOLS.main)
})
