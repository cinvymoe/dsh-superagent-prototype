/** The Aligner role's switch: what a save refuses, what it gates, and what turning it off leaves running. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startRuntime, type Host } from './fixtures/host.ts'
import { AGENT_ROLES, AgentsConfigSchema, SettingsSchema, policyVersion, type AgentsConfig } from '../src/policy.ts'
import { validateAgentRoles } from '../src/app/agent-tools.ts'
import { policyHistory } from '../src/app/settings-history.ts'
import { UserError } from '../src/core/index.ts'

/** The id of the first human message on a local issue's thread. */
const firstTrigger = (h: Host, issueId: string) => h.runtime.store.read.threadTriggers(`local:${issueId}`, 1)[0]!.id

let h: Host
let project: { id: string }
beforeEach(async () => {
  h = await startRuntime()
  project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' })
})
afterEach(async () => { await h.stop() })

const agentsOf = () => h.runtime.store.settings().agents
/** The saved block with the aligner's switch set, which is the only role a save may turn off. */
const withAligner = (enabled: boolean): AgentsConfig => ({ ...agentsOf(), aligner: { ...agentsOf().aligner, enabled } })
const saveAgents = async (value: AgentsConfig) =>
  await h.runtime.settings.save('agents', value, h.runtime.store.blockRevision('agents'), 'panel')
/** Accept a requirement for alignment and return its Align Ticket. */
const acceptForAlignment = async (issueId: string) => {
  await h.runtime.idle()
  const accepted = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issueId), title: 'Align the board',
    worktree_name: 'align-the-board', acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  return { ticketId: accepted.ticket.ticket_id, sessionId: `worker-${accepted.ticket.ticket_id}` }
}
/** Let a discussion's Answerer say `answer`, as its model would, and end its turn. */
const settle = async (discussionId: string, answer = 'The answer') => {
  const sessionId = `answerer-${discussionId}`
  await vi.waitFor(() => expect(h.agents.get(sessionId)?.status).toBe('running'))
  const agent = h.agents.get(sessionId)!
  const list = h.events.get(sessionId)!
  list.push({ type: 'assistant/message', seq: (list.at(-1)?.seq ?? -1) + 1,
    data: { message: { content: [{ type: 'text', text: answer }] } } } as never)
  agent.status = 'idle'
  h.ctx.emit('agent/status', { agent, status: 'idle' } as never)
  await h.runtime.answers.idle()
}

it('reads every role as on by default, refuses to turn infrastructure roles off, and accepts the aligner off', async () => {
  // Old blocks carry no `enabled`, so reading one yields every role on; only the Aligner is switchable.
  const defaults = SettingsSchema.parse({}).agents
  expect(Object.fromEntries(AGENT_ROLES.map(role => [role, defaults[role].enabled]))).toEqual({ main: true, worker: true, aligner: true, answerer: true })
  // A block stored before the field existed reads as on, role by role.
  expect(AgentsConfigSchema.parse({ main: { model: null, enabledPlugins: [] } }).main.enabled).toBe(true)
  expect(Object.fromEntries(AGENT_ROLES.map(role => [role, h.runtime.settings.catalog().roles.find(entry => entry.role === role)!.switchable])))
    .toEqual({ main: false, worker: false, aligner: true, answerer: false })

  for (const role of ['main', 'worker', 'answerer'] as const) {
    const refused = await saveAgents({ ...agentsOf(), [role]: { ...agentsOf()[role], enabled: false } })
      .then(() => undefined, (error: unknown) => error)
    expect(refused).toBeInstanceOf(UserError)
    expect(refused).toMatchObject({ code: 'agentsRoleRequired', values: { role } })
    expect(agentsOf()[role].enabled).toBe(true)
    expect(() => validateAgentRoles({ ...agentsOf(), [role]: { ...agentsOf()[role], enabled: false } }))
      .toThrow(new UserError('agentsRoleRequired', { role }))
  }

  // `GET settings` names every role, its switch and whether the panel may offer one; only the Aligner's is switchable.
  const settingsRoles = (await h.api('GET', 'settings')).body.agents as { roles: { role: string; enabled: boolean; switchable: boolean }[] }
  expect(settingsRoles.roles.map(entry => ({ role: entry.role, enabled: entry.enabled, switchable: entry.switchable })))
    .toEqual([{ role: 'main', enabled: true, switchable: false }, { role: 'worker', enabled: true, switchable: false },
      { role: 'aligner', enabled: true, switchable: true }, { role: 'answerer', enabled: true, switchable: false }])
  // `GET state` carries the same roles at runtime, with the pool each one holds and how many Sessions run now.
  const state = async () => (await h.api('GET', 'state')).body as { agents: { roles: { role: string; enabled: boolean; switchable: boolean
    running: number; limit: number | null }[] } }
  expect((await state()).agents.roles).toEqual([
    { role: 'main', enabled: true, switchable: false, running: 0, limit: null },
    { role: 'worker', enabled: true, switchable: false, running: 0, limit: 3 },
    { role: 'aligner', enabled: true, switchable: true, running: 0, limit: 2 },
    { role: 'answerer', enabled: true, switchable: false, running: 0, limit: 2 },
  ])

  const save = await saveAgents(withAligner(false))
  expect(save.saved).toBe(true)
  expect(agentsOf().aligner.enabled).toBe(false)
  const catalog = h.runtime.settings.catalog().roles.find(entry => entry.role === 'aligner')!
  expect(catalog).toMatchObject({ enabled: false, switchable: true })
  // The other roles' switches are not offered, so their stored flags stay on.
  expect(h.runtime.settings.catalog().roles.filter(entry => entry.switchable).map(entry => entry.role)).toEqual(['aligner'])
  // Turning it off is a runtime state the panel reads, and the history names the role rather than one of its plugins.
  expect((await state()).agents.roles.find(role => role.role === 'aligner')).toMatchObject({ enabled: false, switchable: true })
  expect(policyHistory(h.runtime.store, h.runtime.sources, policyVersion(h.runtime.store.settings())).items[0]!.changes)
    .toEqual([{ code: 'agentRoleDisabled', role: 'aligner' }])
  await saveAgents(withAligner(true))
  expect(policyHistory(h.runtime.store, h.runtime.sources, policyVersion(h.runtime.store.settings())).items[0]!.changes)
    .toEqual([{ code: 'agentRoleEnabled', role: 'aligner' }])
})

it('refuses a conclusion handed to a turned-off aligner with 409 roleDisabled, and takes it once the role is on', async () => {
  const issue = h.runtime.local.create({ title: 'Split the modules', body: 'Discussions and requirements share one module.', project: project.id })
  await h.runtime.idle()
  await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issue.id), title: 'Split the modules', worktree_name: 'split-modules',
    acknowledgement: '收到，先讨论一下再对齐。', mode: 'discuss' })
  await h.runtime.idle()
  const discussion = h.runtime.discussions.list(project.id).find(entry => entry.issueId === issue.id)!
  await settle(discussion.id, 'Split by host: discussions.ts keeps records, answers.ts runs the Answerer.')

  await saveAgents(withAligner(false))
  const refused = await h.api('POST', `local/discussions/${discussion.id}/handoff`)
  expect(refused.status).toBe(409)
  expect(refused.body).toMatchObject({ code: 'roleDisabled', values: { role: 'aligner' } })
  // The refusal creates no Ticket that could never run.
  expect(h.runtime.store.tickets.list()).toEqual([])

  await saveAgents(withAligner(true))
  const handed = await h.api('POST', `local/discussions/${discussion.id}/handoff`)
  expect(handed.status).toBe(200)
  expect((handed.body.ticket as { mode?: string }).mode).toBe('align')
})

it('fails an align Ticket queued before the role was turned off, before it takes a slot, and starts it on retry after enabling', async () => {
  // Pausing holds the launch, so the Ticket is genuinely queued when the role turns off.
  await h.runtime.settings.pause(true, 'panel')
  const issue = h.runtime.local.create({ title: 'Queued alignment', project: project.id })
  await h.runtime.idle()
  const accepted = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issue.id), title: 'Align the queued board',
    worktree_name: 'align-queued-board', acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  const ticketId = accepted.ticket.ticket_id
  expect(h.agents.get(`worker-${ticketId}`)).toBeUndefined()

  await saveAgents(withAligner(false))
  await h.runtime.settings.pause(false, 'panel')
  await h.runtime.idle()

  const failed = h.runtime.store.tickets.get(ticketId)!
  expect(failed.assignments.at(-1)).toMatchObject({ report: { state: 'failed',
    reason: { code: 'roleDisabled', values: { role: 'aligner' } } } })
  // No Session was created, the launch effect is finished, and nothing retries it on its own.
  expect(h.agents.get(`worker-${ticketId}`)).toBeUndefined()
  expect(h.runtime.effects.pending('launch')).toBe(false)
  // A person's retry is the remedy: enabling the role does not launch the failed Ticket by itself.
  await saveAgents(withAligner(true))
  await h.runtime.idle()
  expect(h.runtime.store.tickets.get(ticketId)!.assignments.at(-1)!.report).toMatchObject({ state: 'failed' })
  h.runtime.engine.retryTicket(ticketId)
  await h.runtime.idle()
  expect(h.runtime.store.tickets.get(ticketId)!.assignments.at(-1)).toMatchObject({ state: 'running' })
  expect(h.agents.get(`worker-${ticketId}`)?.status).toBe('running')
})

it('leaves a running aligner round alone, keeps its new Inputs undelivered, and delivers them when the role is enabled again', async () => {
  const issue = h.runtime.local.create({ title: 'Running alignment', project: project.id })
  const { ticketId, sessionId } = await acceptForAlignment(issue.id)
  expect(h.agents.get(sessionId)?.status).toBe('running')

  await saveAgents(withAligner(false))
  await h.runtime.idle()
  // The round in flight is not interrupted, and the Session stays for a person to use directly.
  expect(h.agents.get(sessionId)?.status).toBe('running')
  expect(h.runtime.store.tickets.get(ticketId)!.assignments.at(-1)!.state).toBe('running')

  // A person's message on the requirement's Thread becomes an Input that waits for the role to come back.
  h.runtime.local.comment(issue.id, 'One more thing for the alignment.')
  await h.runtime.idle()
  const waiting = h.runtime.store.tickets.get(ticketId)!
  expect(waiting.undelivered).toHaveLength(1)
  const delivered = () => h.deliveries.mock.calls
    .some(([call]) => call.sessionId === sessionId && call.text.includes('One more thing for the alignment.'))
  expect(delivered()).toBe(false)

  // Enabling the role and saving flushes the same Ticket's backlog.
  await saveAgents(withAligner(true))
  await h.runtime.idle()
  expect(h.runtime.store.tickets.get(ticketId)!.undelivered).toEqual([])
  expect(delivered()).toBe(true)
})