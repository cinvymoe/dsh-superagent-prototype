/** Local discuss → align: a requirement the Router talks through first opens a discussion, and a person hands its conclusion to the Aligner. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startRuntime, type Host } from './fixtures/host.ts'
import { alignTicketId } from '../src/core/index.ts'
import type { LocalDiscussion } from '../src/sources/local-format.ts'

/** The id of the first human message on a local issue's thread. */
const firstTrigger = (h: Host, issueId: string) => h.runtime.store.read.threadTriggers(`local:${issueId}`, 1)[0]!.id

let h: Host
let project: { id: string }
beforeEach(async () => {
  h = await startRuntime()
  project = h.runtime.local.createProject({ name: 'Demo', repository: 'deepseek-ai/dsh-superagent-prototype' })
})
afterEach(async () => { await h.stop() })

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

/** Create a requirement and have the Router decide to talk it through before anyone aligns it. */
const talkedThrough = async (title = 'Split the modules') => {
  const issue = h.runtime.local.create({ title, body: 'Discussions and requirements share one module.', project: project.id })
  await h.runtime.idle()
  const routed = await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issue.id), title, worktree_name: 'split-modules',
    acknowledgement: '收到，先讨论一下再对齐。', mode: 'discuss' })
  await h.runtime.idle()
  return { issue, routed, discussion: h.runtime.discussions.list(project.id).find(entry => entry.issueId === issue.id)! }
}

it('opens a discussion about the requirement the Router decides to talk through, and starts no ticket', async () => {
  const { issue, routed, discussion } = await talkedThrough()
  // The routing answer reports the discussion, not a ticket.
  expect(routed).toMatchObject({ decision: 'discuss' })
  expect(routed).not.toHaveProperty('ticket')
  expect(h.runtime.store.tickets.list()).toEqual([])
  // The Decision is recorded on the requirement's own Thread as a discuss one, which settles its triggers.
  const decisions = h.runtime.store.decisions.byThread(`local:${issue.id}`)
  expect(decisions.map(decision => decision.kind)).toEqual(['discuss'])
  expect(h.runtime.store.threads.get(`local:${issue.id}`)?.evaluating).toBeUndefined()

  // A discussion record of its own, linked both ways, named after the requirement and carrying its text.
  expect(discussion).toMatchObject({ title: 'Split the modules', project: project.id, issueId: issue.id, state: 'open' })
  expect(h.runtime.local.get(issue.id)?.discussionId).toBe(discussion.id)
  const triggers = h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10)
  expect(triggers).toHaveLength(1)
  expect(triggers[0]).toMatchObject({ source: 'local', human: true, text: 'Discussions and requirements share one module.' })
  // Its Thread enters no Eval: the Answerer answers it, no worker is dispatched.
  expect(h.runtime.store.threads.get(`local:${discussion.id}`)?.pending).toEqual([])
  expect(h.runtime.store.threads.get(`local:${discussion.id}`)?.evaluating).toBeUndefined()
})

it('answers it read-only, then hands that conclusion to the Aligner as one align ticket', async () => {
  const { issue, discussion } = await talkedThrough()
  await settle(discussion.id, 'Split by host: discussions.ts keeps records, answers.ts runs the Answerer.')
  expect(h.runtime.discussions.get(discussion.id)!.answers).toMatchObject([{ state: 'answered' }])

  const handed = await h.api('POST', `local/discussions/${discussion.id}/handoff`)
  expect(handed.status).toBe(200)
  const body = handed.body as { ticket: { id: string; title: string; mode?: string }; discussion: LocalDiscussion }
  expect(body.ticket).toMatchObject({ id: alignTicketId(issue.id), title: 'Split the modules', mode: 'align' })

  // The Aligner's ticket reads the requirement's own Thread and carries the conclusion as its routing note.
  const ticket = h.runtime.store.tickets.get(body.ticket.id)!
  expect(ticket.mode).toBe('align')
  expect(ticket.plan).toBeUndefined()
  expect(ticket.origin.triggerIds).toContain(firstTrigger(h, issue.id))
  // The worker it started runs the align tool, not execution.
  await h.runtime.idle()
  expect(h.tools.get(`worker-${ticket.id}`)?.has('orchestrator_align')).toBe(true)
  // The discussion keeps the conclusion it handed over, and stays open for later questions.
  expect(h.runtime.discussions.get(discussion.id)).toMatchObject({ state: 'open',
    handoff: { answerId: body.discussion.handoff!.answerId, text: 'Split by host: discussions.ts keeps records, answers.ts runs the Answerer.',
      ticketId: ticket.id } })
  expect(body.discussion.handoff!.text).toBe('Split by host: discussions.ts keeps records, answers.ts runs the Answerer.')

  // The same conclusion is not handed over twice: a new round starts from a new conclusion.
  const again = await h.api('POST', `local/discussions/${discussion.id}/handoff`)
  expect(again.status).toBe(400)
  expect(again.body).toMatchObject({ code: 'discussionHanded' })
  expect(h.runtime.store.tickets.list().filter(item => item.mode === 'align')).toHaveLength(1)
})

it('hands a later conclusion as its own alignment round, queued behind the round before it', async () => {
  const { issue, discussion } = await talkedThrough()
  await settle(discussion.id, 'Split by host.')
  const first = await h.api('POST', `local/discussions/${discussion.id}/handoff`)
  const firstTicket = (first.body as { ticket: { id: string } }).ticket

  // Talking on after the hand-off makes a new conclusion, and that one is a round of its own.
  await h.api('POST', `local/discussions/${discussion.id}/comments`, { text: 'One more question.' })
  await settle(discussion.id, 'Split by host, then by module.')
  const second = await h.api('POST', `local/discussions/${discussion.id}/handoff`)
  expect(second.status).toBe(200)
  const body = second.body as { ticket: { id: string }; discussion: LocalDiscussion }
  expect(body.ticket.id).toBe(alignTicketId(issue.id, 2))
  // One alignment runs at a time: the second round waits on the first round's ticket.
  expect(h.runtime.store.tickets.get(body.ticket.id)!.dependsOn).toEqual([firstTicket.id])
  expect(body.discussion.alignments?.map(round => round.roundId)).toEqual(['al-1', 'al-2'])
  expect(body.discussion.handoff).toMatchObject({ roundId: 'al-2', ticketId: body.ticket.id,
    text: 'Split by host, then by module.' })
})

it('refuses a discussion about no requirement, one with no answered message, or an unknown one', async () => {
  const loose = h.runtime.discussions.create({ body: 'A question with no requirement yet', project: project.id })
  const unlinked = await h.api('POST', `local/discussions/${loose.id}/handoff`)
  expect(unlinked.status).toBe(400)
  expect(unlinked.body).toMatchObject({ code: 'discussionUnlinked' })
  expect(h.runtime.store.tickets.list()).toEqual([])

  const { discussion } = await talkedThrough()
  const unanswered = await h.api('POST', `local/discussions/${discussion.id}/handoff`)
  expect(unanswered.status).toBe(400)
  expect(unanswered.body).toMatchObject({ code: 'discussionUnanswered' })
  expect(h.runtime.store.tickets.list()).toEqual([])

  expect((await h.api('POST', 'local/discussions/d-00000000/handoff')).status).toBe(404)
})

it('dispatches the confirmed slices the Aligner proposes on the handed-off conclusion', async () => {
  const { issue, discussion } = await talkedThrough()
  await settle(discussion.id, 'Two slices: records, then answers.')
  const handed = await h.api('POST', `local/discussions/${discussion.id}/handoff`)
  const ticket = handed.body.ticket as { id: string }
  await h.runtime.idle()
  const sessionId = `worker-${ticket.id}`
  const slices = [
    { id: 'C1', title: 'Split the records', outcome: 'discussions.ts owns the records', acceptance: ['typecheck passes'], depends_on: [], lane: 'light' },
    { id: 'C2', title: 'Split the answers', outcome: 'answers.ts owns the Answerer', acceptance: ['tests pass'], depends_on: ['C1'], lane: 'full' },
  ]
  expect(await h.runTool(sessionId, 'orchestrator_align', { summary: 'Two slices.', slices, acceptance: ['both merge'] }))
    .toEqual({ issue_id: issue.id, status: 'proposed', slices: 2 })
  // Slices are only tickets once a person confirms the proposal.
  expect(h.runtime.store.tickets.list().filter(item => item.plan)).toEqual([])
  const confirmed = await h.api('POST', `local/issues/${issue.id}/alignment/decision`, { decision: 'confirm' })
  expect(confirmed.status).toBe(200)
  const planned = h.runtime.store.tickets.list().filter(item => item.plan?.issueId === issue.id)
  expect(planned.map(item => [item.mode, item.plan!.sliceId]).sort()).toEqual([['work', 'C1'], ['work', 'C2']])
})
