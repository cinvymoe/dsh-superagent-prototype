/**
 * The `agents` settings block: the built-in plugin catalog and each role's default tool surface, the settings view, saving
 * with plugin validation, the per-role history diff, and the read tolerance for names the catalog or host no longer has.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { AGENT_ROLES, AgentsConfigSchema, DEFAULT_ENABLED_PLUGINS, SettingsSchema, type AgentsConfig } from '../src/policy.ts'
import { AGENT_TOOLS, BUILTIN_PLUGINS, COMPRESSION_TOOLS, FORBIDDEN_ADDED_TOOLS, MAIN_TOOLS, REQUIRED_TOOLS, WORK_TOOLS, agentCatalog,
  pluginSuggestions, roleTools } from '../src/app/agent-tools.ts'
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
  expect([...AGENT_ROLES]).toEqual(['main', 'aligner', 'executor'])
  expect(BUILTIN_PLUGINS.map(plugin => plugin.id)).toEqual(['image', 'web', 'skills', 'todo', 'subagents', 'billion-context'])
  expect(AGENT_TOOLS.main.preset).toBe('dsh-superagent-router')
  expect(AGENT_TOOLS.aligner.preset).toBe('dsh-superagent-worker')
  expect(AGENT_TOOLS.executor.preset).toBe('dsh-superagent-worker')
  expect([...AGENT_TOOLS.main.required]).toEqual(['skill', 'bash', 'read', 'job_output', 'job_list', 'job_kill'])
  expect([...AGENT_TOOLS.executor.required]).toEqual(REQUIRED_TOOLS.executor)
  // An applicable plugin never declares a required tool of that role, so no switch can take one away.
  for (const role of AGENT_ROLES) {
    const applicable = BUILTIN_PLUGINS.filter(plugin => plugin.roles.includes(role))
    expect(REQUIRED_TOOLS[role].filter(name => applicable.some(plugin => plugin.tools.includes(name))), role).toEqual([])
  }
  // A new database starts on the plugin defaults that reproduce the per-tool surface it replaced.
  expect(emptyAgents.main.enabledPlugins).toEqual(['image', 'billion-context'])
  expect(emptyAgents.aligner.enabledPlugins).toEqual(['image', 'web', 'skills', 'todo', 'subagents'])
  expect(emptyAgents.executor.enabledPlugins).toEqual(DEFAULT_ENABLED_PLUGINS.executor)
  expect(emptyAgents.plugins).toEqual([])
})

it('reproduces the old tool set of every role exactly from the default plugin list', () => {
  // The main Session keeps its seven built-ins plus billion-context's six compression tools, in the order it always got them.
  expect(roleTools('main', emptyAgents)).toEqual([...MAIN_TOOLS, ...COMPRESSION_TOOLS])
  expect(new Set(roleTools('main', emptyAgents))).toEqual(new Set([...MAIN_TOOLS, ...COMPRESSION_TOOLS]))
  // Both workers keep exactly the old work tool set, in catalog order.
  expect(roleTools('aligner', emptyAgents)).toEqual(WORK_TOOLS)
  expect(roleTools('executor', emptyAgents)).toEqual(WORK_TOOLS)
  // The built-in groups together account for every optional tool; nothing was lost in the move from per-tool switches.
  expect(new Set(BUILTIN_PLUGINS.flatMap(plugin => plugin.tools))).toEqual(new Set([...WORK_TOOLS.filter(name => !REQUIRED_TOOLS.executor.includes(name)),
    ...COMPRESSION_TOOLS]))
})

it('adds a plugin\'s tools, drops them when its switch is off, deduplicates names and keeps the catalog order', () => {
  // Enabling billion-context on the main Session appends exactly its six tools after the required ones and read_image.
  expect(roleTools('main', emptyAgents)).toEqual([...MAIN_TOOLS, ...COMPRESSION_TOOLS])
  const withoutCompression = roleOf(emptyAgents, 'main', ['image'])
  expect(roleTools('main', withoutCompression)).toEqual(MAIN_TOOLS)
  // Turning web off takes both of its tools and leaves the rest of the worker surface untouched.
  const withoutWeb = roleOf(emptyAgents, 'executor', ['image', 'skills', 'todo', 'subagents'])
  expect(roleTools('executor', withoutWeb)).toEqual(WORK_TOOLS.filter(name => name !== 'web_search' && name !== 'web_fetch'))
  const withoutImage = roleOf(emptyAgents, 'executor', ['web', 'skills', 'todo', 'subagents'])
  expect(roleTools('executor', withoutImage)).not.toContain('read_image')
  // A stored plugin may repeat a tool another one declares, or a required one: it is named once, in catalog position.
  const extra = settingsOf({ ...emptyAgents, plugins: [{ id: 'extra', name: 'Extra', tools: ['plugin_lint', 'read_image', 'bash', 'web_search'] }],
    executor: { ...emptyAgents.executor, enabledPlugins: [...emptyAgents.executor.enabledPlugins, 'extra'] } })
  const tools = roleTools('executor', extra)
  expect(tools).toEqual([...WORK_TOOLS, 'plugin_lint'])
  expect(tools.filter(name => name === 'read_image')).toHaveLength(1)
  // Runtime reading stays lenient: an unknown or inapplicable plugin id contributes nothing rather than throwing.
  expect(roleTools('main', roleOf(emptyAgents, 'main', ['missing', 'web']))).toEqual(REQUIRED_TOOLS.main)
  expect(roleTools('executor', roleOf(emptyAgents, 'executor', ['billion-context']))).toEqual(REQUIRED_TOOLS.executor)
})

it('resolves each role\'s model through its own override, then the role default, an aligner following the executor', () => {
  const evalModel = { provider: 'eval-provider', model: 'eval-model' }
  const executionModel = { provider: 'execution-provider', model: 'execution-model' }
  const mainModel = { provider: 'main-provider', model: 'main-model' }
  const alignerModel = { provider: 'aligner-provider', model: 'aligner-model' }
  const value = (agents: Record<string, unknown>) => SettingsSchema.parse({ eval: { model: evalModel }, executor: { model: executionModel }, agents })
  expect(roleModel(value({}), 'main')).toEqual(evalModel)
  expect(roleModel(value({ main: { model: mainModel } }), 'main')).toEqual(mainModel)
  expect(roleModel(value({}), 'executor')).toEqual(executionModel)
  expect(roleModel(value({ executor: { model: mainModel } }), 'executor')).toEqual(mainModel)
  // An aligner with no override follows the executor's effective model, override or default.
  expect(roleModel(value({}), 'aligner')).toEqual(executionModel)
  expect(roleModel(value({ executor: { model: mainModel } }), 'aligner')).toEqual(mainModel)
  expect(roleModel(value({ aligner: { model: alignerModel } }), 'aligner')).toEqual(alignerModel)
})

it('applies an aligner\'s own plugin switches to its alignment and discussion Sessions while the executor keeps its set', async () => {
  h = await startRuntime()
  const project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' })
  const issue = h.runtime.local.create({ title: 'Align the local board', body: 'Requirements arrive in the panel.', project: project.id })
  await h.runtime.idle()
  const alignerModel = { provider: 'align-provider', model: 'align-model' }
  const value = settingsOf({ ...emptyAgents, aligner: { model: alignerModel,
    enabledPlugins: ['web', 'skills', 'todo', 'subagents'] } })
  expect(await h.api('PUT', 'settings/agents', { value, revision: 0 })).toMatchObject({ status: 200 })
  const llm = (h.ctx as unknown as { llm: { resolveCallConfig: ReturnType<typeof vi.fn> } }).llm
  llm.resolveCallConfig.mockClear()
  const triggerId = h.runtime.store.read.threadTriggers(`local:${issue.id}`, 1)[0]!.id
  const align = await h.route({ kind: 'accept', trigger_id: triggerId, title: 'Align the local board', worktree_name: 'align-local-board',
    acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  expect(llm.resolveCallConfig).toHaveBeenCalledWith(alignerModel)
  const alignAllow = h.restrictions.get(`worker-${align.ticket.ticket_id}`)!.at(-1)!
  expect(alignAllow).not.toContain('read_image')
  expect(alignAllow).toContain('bash')
  // A discussion's Answerer reuses the aligner's model and switches: read-only, narrowed to the aligner's own plugins, no alignment tool.
  const discussion = h.runtime.discussions.create({ body: 'Discuss the split', project: project.id })
  const answerer = `answerer-${discussion.id}`
  await vi.waitFor(() => expect(h!.agents.get(answerer)?.status).toBe('running'))
  expect(llm.resolveCallConfig).toHaveBeenCalledWith(alignerModel)
  const answererAllow = h.restrictions.get(answerer)!.at(-1)!
  expect(answererAllow).not.toContain('read_image')
  expect(answererAllow).toContain('read')
  expect(answererAllow).not.toContain('bash')
  expect(h.tools.get(answerer)!.has('orchestrator_align')).toBe(false)
  const work = await h.acceptedTicket(feishu('2', '@bot 修一下回归'))
  expect(h.restrictions.get(work.sessionId)!.at(-1)).toContain('read_image')
})

it('returns the agents block with its revision, the shared plugin catalog and each role\'s plugin scope in GET settings', async () => {
  h = await startRuntime()
  const { status, body } = await h.api('GET', 'settings')
  expect(status).toBe(200)
  const settings = body as unknown as SettingsBody
  expect(settings.blocks.agents).toEqual({ revision: 0, value: emptyAgents })
  expect(settings.agents.roles.map(entry => entry.role)).toEqual(['main', 'aligner', 'executor'])
  expect(settings.agents.roles[0]).toMatchObject({ preset: 'dsh-superagent-router', required: REQUIRED_TOOLS.main,
    plugins: ['image', 'billion-context'], enabledPlugins: ['image', 'billion-context'] })
  expect(settings.agents.roles[2]).toMatchObject({ required: REQUIRED_TOOLS.executor,
    plugins: ['image', 'web', 'skills', 'todo', 'subagents'] })
  // The shared catalog marks the built-in groups and the tools this host does not register.
  expect(settings.agents.plugins.map(plugin => [plugin.id, plugin.builtIn, plugin.provided]))
    .toEqual([['image', true, true], ['web', true, true], ['skills', true, true], ['todo', true, true],
      ['subagents', true, true], ['billion-context', true, false]])
  // The bundle's presets register their own groups, so only a host plugin's missing tools are reported.
  expect(settings.agents.plugins[1]!.missingTools).toEqual([])
  expect(settings.agents.plugins[5]!.missingTools).toEqual(COMPRESSION_TOOLS)
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
  const value = settingsOf({ ...emptyAgents, plugins: [ghost], executor: { ...emptyAgents.executor,
    enabledPlugins: [...emptyAgents.executor.enabledPlugins, 'ghost'] } })
  expect(await h.api('PUT', 'settings/agents', { value, revision: 0 })).toMatchObject({ status: 200, body: { saved: true } })
  const settings = (await h.api('GET', 'settings')).body as unknown as SettingsBody
  expect(settings.agents.plugins.find(plugin => plugin.id === 'ghost')).toMatchObject({ provided: false, missingTools: ['ghost_tool'] })
  expect(settings.agents.availableTools).not.toContain('ghost_tool')
  // The declaration stays in the role's configured surface; each Session drops it because the host cannot resolve it.
  expect(roleTools('executor', store.settings().agents)).toContain('ghost_tool')
  const history = (await h.api('GET', 'policy/history')).body as unknown as HistoryBody
  expect(history.items[0]!.changes).toEqual(expect.arrayContaining([{ code: 'agentPluginAdded', items: ['Ghost tools'] },
    { code: 'agentExecutorPluginEnabled', items: ['Ghost tools'] }]))
})

it('saves a valid plugin value, increments the block revision and diffs plugin enable, disable, add and remove', async () => {
  h = await startRuntime()
  const { store } = h.runtime
  const extra = { id: 'extra', name: 'Extra tools', tools: ['plugin_lint'] }
  const value = settingsOf({ ...emptyAgents, plugins: [extra],
    main: { model, enabledPlugins: ['image', 'billion-context', 'extra'] } })
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
  const withPlugins = (plugins: unknown[], role: keyof AgentsConfig = 'executor', enabledPlugins = emptyAgents.executor.enabledPlugins) =>
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
  expect(await put(settingsOf({ ...emptyAgents, executor: { ...emptyAgents.executor, enabledPlugins: ['missing'] } })))
    .toMatchObject({ status: 400, body: { code: 'agentsUnknownPlugin', values: { role: 'executor', plugins: 'missing' } } })
  expect(await put(settingsOf({ ...emptyAgents, main: { ...emptyAgents.main, enabledPlugins: ['web'] } })))
    .toMatchObject({ status: 400, body: { code: 'agentsPluginRole', values: { role: 'main', plugins: 'web' } } })
  expect(await put(settingsOf({ ...emptyAgents, executor: { ...emptyAgents.executor, enabledPlugins: ['billion-context'] } })))
    .toMatchObject({ status: 400, body: { code: 'agentsPluginRole', values: { role: 'executor', plugins: 'billion-context' } } })
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
      plugins: [{ id: 'imported-executor', name: 'Imported executor tools', tools: ['uninstalled_plugin_tool'], roles: ['executor'] }],
      executor: { ...settings.agents.executor, enabledPlugins: [...settings.agents.executor.enabledPlugins, 'imported-executor'] } } })
  })
  expect(h.runtime.store.settings().agents.plugins[0]!.tools).toEqual(['uninstalled_plugin_tool'])
  const settings = (await h.api('GET', 'settings')).body as unknown as SettingsBody
  expect(settings.blocks.agents.value.executor.enabledPlugins).toContain('imported-executor')
  expect(settings.agents.plugins.find(plugin => plugin.id === 'imported-executor')!.missingTools).toEqual(['uninstalled_plugin_tool'])
  // An old-style role block is no longer accepted: the migration converts it before a save can read it again.
  expect(AgentsConfigSchema.safeParse({ main: { disabledTools: [] } }).success).toBe(false)
})

it('validates plugin declarations and role scopes through the exported check', () => {
  const plugin = (over: Record<string, unknown>) => ({ id: 'extra', name: 'Extra', tools: ['plugin_lint'], ...over })
  const agents = (plugins: unknown[], role: keyof AgentsConfig = 'executor', enabledPlugins = [...emptyAgents.executor.enabledPlugins]) =>
    settingsOf({ ...emptyAgents, plugins, [role]: { ...emptyAgents[role], enabledPlugins } })
  expect(() => agentCatalog(agents([plugin({})]))).not.toThrow()
  // An unknown id or an inapplicable built-in group is refused only through a save, not while reading.
  expect(roleTools('main', agents([], 'main', ['web']))).toEqual(REQUIRED_TOOLS.main)
})
