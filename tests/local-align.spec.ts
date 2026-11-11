/** The aligner path: a local requirement is accepted for alignment, proposes slices, and a person's confirmation dispatches them. */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { startRuntime, type Host } from './fixtures/host.ts'

/** The id of the first human message on a local issue's thread. */
const firstTrigger = (h: Host, issueId: string) => h.runtime.store.read.threadTriggers(`local:${issueId}`, 1)[0]!.id

let h: Host
let project: { id: string }
beforeEach(async () => { h = await startRuntime(); project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' }) })
afterEach(async () => { await h.stop() })

const slices = [
  { id: 'C1', title: 'Read the module', outcome: 'The module reads the requirement', acceptance: ['typecheck passes'], depends_on: [], lane: 'light' },
  { id: 'C2', title: 'Write the module', outcome: 'The module implements it', acceptance: ['tests pass'], depends_on: ['C1'], lane: 'full' },
]

it('accepts a local requirement for alignment and gives its worker the align tool instead of execution', async () => {
  const issue = h.runtime.local.create({ title: 'Add a local board', body: 'Requirements arrive in the panel.', project: project.id })
  await h.runtime.idle()
  const result = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issue.id), title: 'Align the local board',
    worktree_name: 'align-local-board', acknowledgement: '收到，先做需求对齐。' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  const ticket = h.runtime.store.tickets.get(result.ticket.ticket_id)!
  expect(ticket.mode).toBe('align')
  const sessionId = `worker-${ticket.id}`
  const tools = h.tools.get(sessionId)!
  expect(tools.has('orchestrator_align')).toBe(true)
  // The proposal is attached to the issue the ticket came from, and starts no work.
  const proposal = await h.runTool(sessionId, 'orchestrator_align', { summary: 'Two slices.', slices, acceptance: ['both slices merge'] })
  expect(proposal).toEqual({ issue_id: issue.id, status: 'proposed', slices: 2 })
  expect(h.runtime.store.tickets.list().filter(item => item.plan)).toEqual([])
})

it('dispatches the confirmed slices as tickets, one per slice, and only after the person confirms', async () => {
  const issue = h.runtime.local.create({ title: 'Add a local board', project: project.id })
  await h.runtime.idle()
  const accepted = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issue.id), title: 'Align the local board',
    worktree_name: 'align-local-board', acknowledgement: '收到，先做需求对齐。', mode: 'align' }) as { ticket: { ticket_id: string } }
  await h.runtime.idle()
  const sessionId = `worker-${accepted.ticket.ticket_id}`
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'Two slices.', slices, acceptance: [] })
  const pending = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'reject', reason: 'Narrower' })
  expect(pending.status).toBe(200)
  expect(h.runtime.store.tickets.list().filter(ticket => ticket.plan)).toEqual([])
  await h.runTool(sessionId, 'orchestrator_align', { summary: 'Two slices, narrowed.', slices, acceptance: [] })
  const confirmed = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm' })
  expect(confirmed.body).toEqual(expect.objectContaining({ tickets: expect.any(Array) }))
  expect(confirmed.status).toBe(200)
  const tickets = h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === issue.id)
  expect(tickets.map(ticket => ticket.plan!.sliceId).sort()).toEqual(['C1', 'C2'])
  expect(tickets.find(ticket => ticket.plan!.sliceId === 'C1')!.plan!.acceptance).toEqual(['typecheck passes'])
  expect(tickets.find(ticket => ticket.plan!.sliceId === 'C1')!.execution?.assignment).toContain('Acceptance criteria:\n- typecheck passes')
  expect(tickets.find(ticket => ticket.plan!.sliceId === 'C1')!.execution?.repository).toBe('deepseek-ai/dsh-superagent-prototype')
  const environment = Object.fromEntries(h.runtime.ticketEnvironment(tickets[0]!).map(variable => [variable.key, variable.value]))
  expect(environment.DSH_SUPERAGENT_GITHUB_REPOSITORY).toBe('deepseek-ai/dsh-superagent-prototype')
  expect(tickets.find(ticket => ticket.plan!.sliceId === 'C2')!.dependsOn)
    .toEqual([tickets.find(ticket => ticket.plan!.sliceId === 'C1')!.id])
  // The dependent slice waits for its dependency to end before its worker launches.
  await h.runtime.idle()
  const first = tickets.find(ticket => ticket.plan!.sliceId === 'C1')!, second = tickets.find(ticket => ticket.plan!.sliceId === 'C2')!
  expect(h.runtime.store.tickets.get(second.id)!.assignments[0]!.state).toBe('pending')
  expect(h.runtime.store.tickets.get(first.id)!.assignments[0]!.state).toBe('running')
  // Confirming twice dispatches nothing new.
  const again = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm' })
  expect(again.status).toBe(200)
  expect(h.runtime.store.tickets.list().filter(ticket => ticket.plan?.issueId === issue.id)).toHaveLength(2)
})

it('creates projects over HTTP and keeps requirements scoped to them', async () => {
  const created = await h.api('POST', 'local/projects', { name: 'Other', repository: 'acme/other' })
  expect(created.status).toBe(200)
  const project = created.body.project as { id: string }
  const submitted = await h.api('POST', 'local/issues', { title: 'Project requirement', project: project.id })
  expect(submitted.status).toBe(200)
  const issue = submitted.body.issue as { id: string; project: string }
  expect(issue.project).toBe(project.id)
  const detail = await h.api('GET', `local/issues/${issue.id}`)
  expect(detail.body.project).toMatchObject({ id: project.id, repository: 'acme/other' })
  const missing = await h.api('POST', 'local/issues', { title: 'No project' })
  expect(missing.status).toBe(400)
})
