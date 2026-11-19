/** The Agent role registry: one spec per configured role, and each spec still says what the separate tables said. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { alignPrompt, workerPrompt } from '../src/app/context.ts'
import { AGENT_SPECS, ANSWER_CONCURRENCY, agentSpec } from '../src/app/agent-specs.ts'
import { AGENT_TOOLS, REQUIRED_TOOLS, agentCatalog } from '../src/app/agent-tools.ts'
import type { Variable } from '../src/app/execution-environment.ts'
import { Prompts, defaultPrompts } from '../src/app/prompts.ts'
import { roleModel } from '../src/app/role-models.ts'
import { Store } from '../src/app/store.ts'
import type { Ticket } from '../src/core/index.ts'
import { AGENT_ROLES, DEFAULT_ENABLED_PLUGINS, SettingsSchema } from '../src/policy.ts'
import { startRuntime, type Host } from './fixtures/host.ts'

let h: Host | undefined
afterEach(async () => { await h?.stop(); h = undefined })

it('gives every configured role exactly one spec, in the order the panel renders', () => {
  expect(Object.keys(AGENT_SPECS)).toEqual([...AGENT_ROLES])
  for (const role of AGENT_ROLES) expect(agentSpec(role).id).toBe(role)
})

it('keeps each role\'s preset, required tools and default plugins item by item', () => {
  // The frozen values the catalog, the migration and the panel read before the registry held them.
  expect(AGENT_SPECS.main.preset).toBe('dsh-superagent-router')
  expect(AGENT_SPECS.worker.preset).toBe('dsh-superagent-worker')
  expect(AGENT_SPECS.answerer.preset).toBe('dsh-superagent-worker')
  expect([...AGENT_SPECS.main.required]).toEqual(['skill', 'bash', 'read', 'job_output', 'job_list', 'job_kill'])
  expect([...AGENT_SPECS.worker.required]).toEqual(['read', 'write', 'edit', 'glob', 'grep', 'bash', 'pwsh', 'job_output', 'job_list', 'job_kill'])
  expect([...AGENT_SPECS.answerer.required]).toEqual([...AGENT_SPECS.worker.required])
  expect([...AGENT_SPECS.main.defaultPlugins]).toEqual(['image', 'billion-context'])
  expect([...AGENT_SPECS.worker.defaultPlugins]).toEqual(['image', 'web', 'skills', 'todo', 'subagents', 'billion-context'])
  expect([...AGENT_SPECS.answerer.defaultPlugins]).toEqual(['image', 'web', 'skills', 'todo', 'subagents'])
  // The historical tables still agree with the registry, so no caller keeps a second copy of these facts.
  for (const role of AGENT_ROLES) {
    expect(AGENT_SPECS[role].preset).toBe(AGENT_TOOLS[role].preset)
    expect([...AGENT_SPECS[role].required]).toEqual([...REQUIRED_TOOLS[role]])
    expect([...AGENT_SPECS[role].defaultPlugins]).toEqual([...DEFAULT_ENABLED_PLUGINS[role]])
  }
})

it('resolves each role\'s model through the same inheritance chain as roleModel', () => {
  const evalModel = { provider: 'eval-provider', model: 'eval-model' }
  const executionModel = { provider: 'execution-provider', model: 'execution-model' }
  const mainModel = { provider: 'main-provider', model: 'main-model' }
  const answererModel = { provider: 'answerer-provider', model: 'answerer-model' }
  const value = (agents: Record<string, unknown>) => SettingsSchema.parse({ eval: { model: evalModel }, executor: { model: executionModel }, agents })
  const empty = value({})
  for (const role of AGENT_ROLES) expect(AGENT_SPECS[role].model(empty)).toEqual(roleModel(empty, role))
  // A main Session inherits the Eval model, a worker the Execution model, and an Answerer the worker's effective model.
  expect(AGENT_SPECS.main.model(empty)).toEqual(evalModel)
  expect(AGENT_SPECS.worker.model(empty)).toEqual(executionModel)
  expect(AGENT_SPECS.answerer.model(empty)).toEqual(executionModel)
  expect(AGENT_SPECS.main.model(value({ main: { model: mainModel } }))).toEqual(mainModel)
  expect(AGENT_SPECS.worker.model(value({ worker: { model: mainModel } }))).toEqual(mainModel)
  expect(AGENT_SPECS.answerer.model(value({ worker: { model: mainModel } }))).toEqual(mainModel)
  expect(AGENT_SPECS.answerer.model(value({ answerer: { model: answererModel } }))).toEqual(answererModel)
})

it('composes each role\'s prompt exactly as the Session kind did', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-specs-'))
  const store = new Store(join(directory, 'db'))
  try {
    const prompts = new Prompts(store, () => 100000, () => undefined, () => false)
    const config = defaultPrompts()
    const environment: Variable[] = [{ key: 'DSH_SUPERAGENT_DIR', value: '/srv/work/fix-1', description: { zh: '', en: 'This ticket\'s directory' }, owner: 'executor' }]
    // The main Session's prompt falls back to the profile's environment, exactly as the undefined argument did before.
    expect(agentSpec('main').prompt(prompts, { config })).toBe(prompts.compose(config, 'orchestrator'))
    expect(agentSpec('main').prompt(prompts, { config, environment })).toBe(prompts.compose(config, 'orchestrator', environment))
    expect(agentSpec('worker').prompt(prompts, { config, environment })).toBe(prompts.compose(config, 'worker', environment))
    // An align Ticket still reads the alignment guide on the worker role; a slice reads its pinned strategy.
    expect(agentSpec('worker').prompt(prompts, { config, ticket: { mode: 'align' } as unknown as Ticket, environment }))
      .toBe(prompts.composeAlign(config, environment))
    expect(agentSpec('worker').prompt(prompts, { config, ticket: { mode: 'work' } as unknown as Ticket, strategy: { mode: 'native' }, environment }))
      .toBe(prompts.composeExecute(config, 'native', environment))
    // A discussion Answerer reads the discussion guide and no Ticket environment.
    expect(agentSpec('answerer').prompt(prompts, { config, environment })).toBe(prompts.composeDiscuss(config, []))
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('keeps the installer and concurrency pool each Session used, with one worker pool for both Ticket modes', () => {
  expect(AGENT_SPECS.main).toMatchObject({ tools: 'main', slot: null })
  expect(AGENT_SPECS.worker.tools).toBe('work')
  expect(AGENT_SPECS.answerer.tools).toBe('answer')
  const settings = SettingsSchema.parse({ executor: { maxWorkers: 4 } })
  expect(AGENT_SPECS.worker.slot).toMatchObject({ pool: 'worker' })
  expect(AGENT_SPECS.worker.slot!.limit(settings)).toBe(4)
  expect(AGENT_SPECS.answerer.slot).toMatchObject({ pool: 'answerer' })
  expect(AGENT_SPECS.answerer.slot!.limit(settings)).toBe(ANSWER_CONCURRENCY)
  expect(ANSWER_CONCURRENCY).toBe(2)
})

it('offers GET settings the configured roles in registry order with the registry\'s metadata', () => {
  const agents = SettingsSchema.parse({}).agents
  const roles = agentCatalog(agents).roles
  expect(roles.map(entry => entry.role)).toEqual([...AGENT_ROLES])
  expect(roles.map(entry => entry.preset)).toEqual(AGENT_ROLES.map(role => agentSpec(role).preset))
  for (const entry of roles) {
    const spec = agentSpec(entry.role)
    expect(entry.required).toEqual([...spec.required])
    expect(entry.enabledPlugins).toEqual([...spec.defaultPlugins])
  }
})

it('runs an align Ticket as a worker Session with the align guide, the align tool and a worker slot', async () => {
  h = await startRuntime()
  const project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' })
  const issue = h.runtime.local.create({ title: 'Align the registry', body: 'The registry comes first.', project: project.id })
  await h.runtime.idle()
  const triggerId = h.runtime.store.read.threadTriggers(`local:${issue.id}`, 1)[0]!.id
  const accepted = await h.route({ kind: 'accept', trigger_id: triggerId, title: 'Align the registry', worktree_name: 'align-registry',
    acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  const sessionId = `worker-${accepted.ticket.ticket_id}`
  expect(h.agents.get(sessionId)?.status).toBe('running')
  // The align Ticket keeps the worker role: its Session carries the align tool and the alignment guide, not the worker mandate.
  expect(h.tools.get(sessionId)!.has('orchestrator_align')).toBe(true)
  const prompt = h.sections.get(sessionId)!.text({})
  expect(prompt).toContain(alignPrompt)
  expect(prompt).not.toContain(workerPrompt)
  // A running align Ticket occupies the worker pool's slot, the same pool an execution Ticket takes.
  expect(h.runtime.executor.activeCount()).toBe(1)
  expect(AGENT_SPECS.worker.slot).toMatchObject({ pool: 'worker' })
})
