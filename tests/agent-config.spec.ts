/**
 * The `agents` settings block: the three-role tool catalog, the settings view and its catalog, saving with validation,
 * the per-role history diff, and the read tolerance for a tool name the catalog no longer has.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { AGENT_ROLES } from '../src/policy.ts'
import { AGENT_TOOLS } from '../src/app/agent-tools.ts'
import { UserError } from '../src/core/index.ts'
import { startRuntime, type Host } from './fixtures/host.ts'

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
