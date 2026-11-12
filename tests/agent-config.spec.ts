/**
 * The `agents` settings block: the three-role tool catalog, the settings view and its catalog, saving with validation,
 * the per-role history diff, and the read tolerance for a tool name the catalog no longer has.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { AGENT_ROLES, SettingsSchema, type AgentsConfig } from '../src/policy.ts'
import { AGENT_TOOLS, MAIN_TOOLS, roleTools, WORK_TOOLS } from '../src/app/agent-tools.ts'
import { roleModel } from '../src/app/role-models.ts'
import { UserError } from '../src/core/index.ts'
import { startRuntime, feishu, type Host } from './fixtures/host.ts'

let h: Host | undefined
afterEach(async () => { await h?.stop(); h = undefined })
const model = { provider: 'main-provider', model: 'main-model' }
const emptyRole = { model: null, disabledTools: [] }
const emptyAgents = { main: emptyRole, aligner: emptyRole, executor: emptyRole }
type SettingsBody = { blocks: { agents: { revision: number; value: typeof emptyAgents } }; agents: { roles: { role: string; preset: string; required: string[]; optional: string[] }[] } }

it('catalogs each Agent role with the tools it keeps, the optional ones it may turn off, and its preset', () => {
  expect([...AGENT_ROLES]).toEqual(['main', 'aligner', 'executor'])
  for (const role of AGENT_ROLES) {
    const { required, optional } = AGENT_TOOLS[role]
    // A tool is either locked or optional, never both, and every role has something a person may turn off.
    expect(required.filter(name => optional.includes(name)), role).toEqual([])
    expect(optional.length, role).toBeGreaterThan(0)
  }
  expect(AGENT_TOOLS.main).toEqual({ preset: 'dsh-superagent-router', required: ['skill', 'bash', 'read', 'job_output', 'job_list', 'job_kill'],
    optional: ['read_image'] })
  // An aligner and an executor run under the worker preset and share the work tools; subagents inherit them without a role.
  expect(AGENT_TOOLS.aligner.preset).toBe('dsh-superagent-worker')
  expect(AGENT_TOOLS.executor).toEqual({ preset: 'dsh-superagent-worker',
    required: ['read', 'write', 'edit', 'glob', 'grep', 'bash', 'job_output', 'job_list', 'job_kill'],
    optional: ['read_image', 'pwsh', 'web_search', 'web_fetch', 'skill', 'todo_write', 'subagent', 'list_subagent_models', 'send_message',
      'list_agents', 'interrupt_agent'] })
  // The host's compression tools and a slice Ticket's execution tools stay automatic, so no save can turn them off.
  const catalogued = Object.values(AGENT_TOOLS).flatMap(entry => [...entry.required, ...entry.optional])
  expect(catalogued.filter(name => name.startsWith('feature_exec_') || name === 'compress')).toEqual([])
})

it('applies each role\'s catalog in order, dropping only optional tools it turns off', () => {
  const agents = (role: keyof AgentsConfig, tools: string[]): AgentsConfig =>
    ({ ...emptyAgents, [role]: { model: null, disabledTools: tools } })
  // No overrides keeps today's exact allow lists, so the regression case is the catalog order itself.
  expect(roleTools('main', emptyAgents)).toEqual(MAIN_TOOLS)
  expect(roleTools('executor', emptyAgents)).toEqual(WORK_TOOLS)
  expect(roleTools('aligner', emptyAgents)).toEqual(WORK_TOOLS)
  expect(roleTools('main', agents('main', ['read_image']))).toEqual(MAIN_TOOLS.filter(name => name !== 'read_image'))
  expect(roleTools('executor', agents('executor', ['web_search', 'read_image']))).toEqual(WORK_TOOLS.filter(name => name !== 'web_search' && name !== 'read_image'))
  // Reading stays lenient at run time: a required tool and a retired name cannot narrow a Session's list.
  expect(roleTools('executor', agents('executor', ['bash', 'retired_tool']))).toEqual(WORK_TOOLS)
  expect(roleTools('aligner', agents('aligner', ['web_search']))).toEqual(WORK_TOOLS.filter(name => name !== 'web_search'))
})

it('resolves each role\'s model through its own override, then the role default, an aligner following the executor', () => {
  const evalModel = { provider: 'eval-provider', model: 'eval-model' }
  const executionModel = { provider: 'execution-provider', model: 'execution-model' }
  const mainModel = { provider: 'main-provider', model: 'main-model' }
  const alignerModel = { provider: 'aligner-provider', model: 'aligner-model' }
  const settings = (agents: Partial<Record<keyof AgentsConfig, { model: unknown; disabledTools: string[] }>>) =>
    SettingsSchema.parse({ eval: { model: evalModel }, executor: { model: executionModel }, agents })
  const value = (agents: Parameters<typeof settings>[0]) => settings(agents)
  expect(roleModel(value({}), 'main')).toEqual(evalModel)
  expect(roleModel(value({ main: { model: mainModel, disabledTools: [] } }), 'main')).toEqual(mainModel)
  expect(roleModel(value({}), 'executor')).toEqual(executionModel)
  expect(roleModel(value({ executor: { model: mainModel, disabledTools: [] } }), 'executor')).toEqual(mainModel)
  // An aligner with no override follows the executor's effective model, override or default.
  expect(roleModel(value({}), 'aligner')).toEqual(executionModel)
  expect(roleModel(value({ executor: { model: mainModel, disabledTools: [] } }), 'aligner')).toEqual(mainModel)
  expect(roleModel(value({ aligner: { model: alignerModel, disabledTools: [] } }), 'aligner')).toEqual(alignerModel)
})

it('applies an aligner\'s own optional tools to its Session while the executor keeps its set', async () => {
  h = await startRuntime()
  const project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' })
  const issue = h.runtime.local.create({ title: 'Align the local board', body: 'Requirements arrive in the panel.', project: project.id })
  await h.runtime.idle()
  // Only the aligner turns `read_image` off and sets a model; a work Ticket's executor keeps both defaults.
  const alignerModel = { provider: 'align-provider', model: 'align-model' }
  const value = { ...emptyAgents, aligner: { model: alignerModel, disabledTools: ['read_image'] } }
  expect(await h.api('PUT', 'settings/agents', { value, revision: 0 })).toMatchObject({ status: 200 })
  const llm = (h.ctx as unknown as { llm: { resolveCallConfig: ReturnType<typeof vi.fn> } }).llm
  llm.resolveCallConfig.mockClear()
  const triggerId = h.runtime.store.read.threadTriggers(`local:${issue.id}`, 1)[0]!.id
  const align = await h.route({ kind: 'accept', trigger_id: triggerId, title: 'Align the local board', worktree_name: 'align-local-board',
    acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  // The aligner's new Session starts on the aligner's own override.
  expect(llm.resolveCallConfig).toHaveBeenCalledWith(alignerModel)
  const alignAllow = h.restrictions.get(`worker-${align.ticket.ticket_id}`)!.at(-1)!
  expect(alignAllow).not.toContain('read_image')
  expect(alignAllow).toContain('bash')
  const work = await h.acceptedTicket(feishu('2', '@bot 修一下回归'))
  const executorAllow = h.restrictions.get(work.sessionId)!.at(-1)!
  expect(executorAllow).toContain('read_image')
})

it('returns the agents block with its revision and the three-role catalog in GET settings', async () => {
  h = await startRuntime()
  const { status, body } = await h.api('GET', 'settings')
  expect(status).toBe(200)
  const settings = body as unknown as SettingsBody
  expect(settings.blocks.agents).toEqual({ revision: 0, value: emptyAgents })
  expect(settings.agents.roles.map(entry => entry.role)).toEqual(['main', 'aligner', 'executor'])
  expect(settings.agents.roles[0]).toMatchObject({ preset: 'dsh-superagent-router', required: AGENT_TOOLS.main.required, optional: ['read_image'] })
  expect(settings.agents.roles[1]).toMatchObject({ preset: 'dsh-superagent-worker', optional: AGENT_TOOLS.aligner.optional })
  expect(settings.agents.roles[2]!.optional).toContain('web_search')
  expect(settings.agents.roles[2]!.required).toContain('bash')
})

it('saves a valid agents value, increments the block revision, records history and diffs each role', async () => {
  h = await startRuntime()
  const { store, settings } = h.runtime
  const value = { main: { model, disabledTools: [] }, aligner: emptyRole, executor: { model: null, disabledTools: ['web_search'] } }
  const saved = await h.api('PUT', 'settings/agents', { value, revision: 0 })
  expect(saved.status).toBe(200)
  expect(saved.body).toMatchObject({ saved: true, revision: 1, policy_changed: false, restarting: false })
  expect(store.blockRevision('agents')).toBe(1)
  expect(store.settings().agents).toEqual(value)
  expect((await h.api('GET', 'settings')).body.blocks).toMatchObject({ agents: { revision: 1, value } })
  // History holds the save and words each role's model and turned-off-tool change.
  const history = (await h.api('GET', 'policy/history')).body as unknown as { items: { block: string; changes: { code: string; from?: string; to?: string }[] | null }[] }
  expect(history.items[0]).toMatchObject({ block: 'agents' })
  expect(history.items[0]!.changes).toEqual(expect.arrayContaining([{ code: 'agentMainModel' },
    { code: 'agentExecutorTools', from: '', to: 'web_search' }]))
  // A model change and a tool change in another role word their own entries; the untouched role adds none.
  await h.runtime.settings.save('agents', { ...value, aligner: { model, disabledTools: ['subagent'] } }, store.blockRevision('agents'), 'panel')
  const next = (await h.api('GET', 'policy/history')).body as unknown as { items: { changes: { code: string; from?: string; to?: string }[] | null }[] }
  expect(next.items[0]!.changes).toEqual(expect.arrayContaining([{ code: 'agentAlignerModel' },
    { code: 'agentAlignerTools', from: '', to: 'subagent' }]))
  expect(settings.current().agents.aligner).toEqual({ model, disabledTools: ['subagent'] })
})

it('refuses a required or unknown tool, an unavailable model, and any save outside the panel', async () => {
  h = await startRuntime()
  const { store, settings } = h.runtime
  const put = (agents: unknown) => h!.api('PUT', 'settings/agents', { value: agents, revision: store.blockRevision('agents') })
  const withTool = (tool: string) => ({ ...emptyAgents, executor: { model: null, disabledTools: [tool] } })
  expect(await put(withTool('bash'))).toMatchObject({ status: 400,
    body: { code: 'agentsRequiredTool', values: { role: 'executor', tools: 'bash' } } })
  expect(await put(withTool('retired_tool'))).toMatchObject({ status: 400,
    body: { code: 'agentsUnknownTool', values: { role: 'executor', tools: 'retired_tool' } } })
  // A role model the live provider cannot resolve is refused before anything is stored.
  const llm = (h.ctx as unknown as { llm: { resolveCallConfig: ReturnType<typeof vi.fn> } }).llm
  llm.resolveCallConfig.mockImplementationOnce(() => Promise.reject(new Error('no such model')))
  expect(await put({ ...emptyAgents, main: { model, disabledTools: [] } })).toMatchObject({ status: 400,
    body: { code: 'modelUnavailable', values: { block: 'agents.main' } } })
  expect(store.settings().agents).toEqual(emptyAgents)
  // A model or tool change reaches every Session of the role, so the main Session's tool cannot make one.
  await expect(settings.save('agents', withTool('web_search'), store.blockRevision('agents'), 'tool')).rejects.toThrow(new UserError('panelOnlyAgents'))
  expect(store.settings().agents).toEqual(emptyAgents)
  expect(store.blockRevision('agents')).toBe(0)
})

it('still reads an agents block that names a tool the catalog no longer has', async () => {
  h = await startRuntime(seeded => {
    const settings = seeded.settings()
    seeded.saveSettings({ ...settings, agents: { ...settings.agents, executor: { model: null, disabledTools: ['retired_tool'] } } })
  })
  // The upgrade keeps the stored name and starts: nothing validates it against the catalog on the way in.
  expect(h.runtime.store.settings().agents.executor.disabledTools).toEqual(['retired_tool'])
  const settings = (await h.api('GET', 'settings')).body as unknown as SettingsBody
  expect(settings.blocks.agents.value.executor.disabledTools).toEqual(['retired_tool'])
})
