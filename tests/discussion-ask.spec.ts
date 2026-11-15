/** The Answerer's asking tool: questions become one panel card, and the person's answers come back as one discussion message. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startRuntime, type Host } from './fixtures/host.ts'

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

/** A requirement the Router decided to talk through, with its own discussion and no ticket. */
const talkedThrough = async (title = 'Split the modules') => {
  const issue = h.runtime.local.create({ title, body: 'Discussions and requirements share one module.', project: project.id })
  await h.runtime.idle()
  await h.route({ kind: 'accept', trigger_id: firstTrigger(h, issue.id), title, worktree_name: 'split-modules',
    acknowledgement: '收到，先讨论一下再对齐。', mode: 'discuss' })
  await h.runtime.idle()
  const discussion = h.runtime.discussions.list(project.id).find(entry => entry.issueId === issue.id)!
  // The Answerer Session is created by the discussion's first message; its turn is settled so the tool can be called.
  await settle(discussion.id, 'First pass.')
  return { issue, discussion }
}

it('records the questions one card holds and opens no ticket, trigger or eval', async () => {
  const { discussion } = await talkedThrough()
  const triggersBefore = h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10).length
  const result = await h.runTool(`answerer-${discussion.id}`, 'discussion_ask', { questions: [
    { question: 'Which layout should the panel keep?', options: ['Two columns', 'Single column'] },
    { question: 'May the delete button stay?' },
  ] })
  expect(result).toMatchObject({ recorded: true, state: 'open' })
  const stored = h.runtime.discussions.get(discussion.id)!
  expect(stored.asks).toMatchObject([{ state: 'open', questions: [
    { id: 'q1', question: 'Which layout should the panel keep?', options: ['Two columns', 'Single column'] },
    { id: 'q2', question: 'May the delete button stay?' }] }])
  // Asking is a panel record: no second message, no ticket, and the discussion's Thread stays out of Eval.
  expect(h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10)).toHaveLength(triggersBefore)
  expect(h.runtime.store.tickets.list()).toEqual([])
  expect(h.runtime.store.threads.get(`local:${discussion.id}`)?.evaluating).toBeUndefined()
})

it('answers the card as one message of the discussion, and only once', async () => {
  const { discussion } = await talkedThrough()
  await h.runTool(`answerer-${discussion.id}`, 'discussion_ask', { questions: [
    { question: 'Which layout should the panel keep?', options: ['Two columns', 'Single column'] },
    { question: 'May the delete button stay?' },
  ] })
  const askId = h.runtime.discussions.get(discussion.id)!.asks![0]!.id
  const answers = [{ questionId: 'q1', text: 'Two columns' }, { questionId: 'q2', text: 'Yes, but not for a linked one' }]
  const sent = await h.api('POST', `local/discussions/${discussion.id}/asks/${askId}/reply`, { answers })
  expect(sent.status).toBe(200)
  const stored = h.runtime.discussions.get(discussion.id)!
  expect(stored.asks![0]).toMatchObject({ state: 'answered', replies: answers })

  // The answers came back as the discussion's next human message, which is what asks the Answerer again.
  const triggers = h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10)
  const answeredMessage = triggers.find(trigger => trigger.text.startsWith(`Answers to ${askId}`))
  expect(answeredMessage?.text).toContain('Which layout should the panel keep? → Two columns')
  expect(answeredMessage?.text).toContain('May the delete button stay? → Yes, but not for a linked one')
  await settle(discussion.id, 'Then two columns it is.')

  // Submitting the same card again records nothing new and posts no second message.
  const before = h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10).length
  const again = await h.api('POST', `local/discussions/${discussion.id}/asks/${askId}/reply`, { answers })
  expect(again.status).toBe(200)
  expect(h.runtime.store.read.threadTriggers(`local:${discussion.id}`, 10)).toHaveLength(before)
})

it('refuses a second ask while the first card is unanswered', async () => {
  const { discussion } = await talkedThrough()
  await h.runTool(`answerer-${discussion.id}`, 'discussion_ask', { questions: [{ question: 'Which layout?' }] })
  await expect(h.runTool(`answerer-${discussion.id}`, 'discussion_ask', { questions: [{ question: 'And the colour?' }] }))
    .rejects.toThrow(/already has an unanswered ask/)
  expect(h.runtime.discussions.get(discussion.id)!.asks).toHaveLength(1)
})

it('leaves asking off a requirement thread, which reaches Eval instead', async () => {
  const issue = h.runtime.local.create({ title: 'Plain requirement', body: 'No discussion here.', project: project.id })
  await h.runtime.idle()
  expect(h.runtime.discussions.list(project.id)).toEqual([])
  expect(h.tools.get(`answerer-${issue.id}`)).toBeUndefined()
})
