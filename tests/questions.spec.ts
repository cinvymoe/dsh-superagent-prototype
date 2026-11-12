/**
 * Ticket questions on the host: one read-only answer from a Session forked off the Ticket worker at its latest completed
 * turn, the reasons a question cannot be answered, and the Ticket staying untouched by asking.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { threadKey } from '../src/core/index.ts'
import { Questions } from '../src/app/questions.ts'
import { feishu, startRuntime, type Host } from './fixtures/host.ts'

let host: Host
beforeEach(async () => { host = await startRuntime() })
afterEach(async () => { await host.stop() })

/** The fixture's first forked Session: it names forks in order, and every test starts a fresh host. */
const FORKED = 'session-fork-1'
const QUESTION = 'Why did the regression reach the release?'
const ANSWER = 'The margin reset in src/app/passes.ts dropped the padding.'

const questions = () => new Questions({ context: host.ctx, store: host.runtime.store, sessions: host.runtime.sessions })
/** A Session event as DSH's log holds it; this host reads only its type, its seq and a message's text blocks. */
const event = (value: Record<string, unknown>): SessionEvent => value as unknown as SessionEvent
/** Append one event to a Session's log at the next seq. */
const append = (sessionId: string, value: Record<string, unknown>): void => {
  const events = host.events.get(sessionId)!
  events.push(event({ ...value, seq: events.length }))
}
/** A worker that ran one turn: an earlier progress message, the turn's start and its end, where a question forks. */
const completedTurn = (worker: string): void => {
  append(worker, { type: 'assistant/message', time: 1, surfaceOp: 'append',
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'Worker progress, not the answer.' }] }, stream: [] } })
  append(worker, { type: 'turn/start', time: 2, data: { turn: 1 } })
  append(worker, { type: 'turn/end', time: 3, data: { turn: 1, reason: { kind: 'completed' } } })
}
/** The forked Session's model streamed `text` after the inherited prefix, and its turn ended: it is idle again. */
const answerWith = (text: string): void => {
  append(FORKED, { type: 'assistant/message', time: 4, surfaceOp: 'append',
    data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text }] }, stream: [] } })
  host.agents.get(FORKED)!.status = 'idle'
}
/** Wait until the question reached the forked Session, which starts its turn. */
const delivered = () => vi.waitFor(() => expect(host.deliveries)
  .toHaveBeenCalledWith(expect.objectContaining({ sessionId: FORKED, mode: 'queue', text: QUESTION })))

it('answers one question from a Session forked off the worker\'s latest completed turn, then archives it', async () => {
  const { ticket, trigger, sessionId: worker } = await host.acceptedTicket(feishu('1', '@bot 修一下回归'))
  completedTurn(worker)
  const thread = threadKey(trigger.threads[0]!), triggers = host.runtime.store.read.recentTriggers(0, 100).length
  const decisions = host.runtime.store.decisions.byThread(thread).length
  const asked = questions().ask(ticket, QUESTION)
  await delivered()
  answerWith(ANSWER)
  await expect(asked).resolves.toEqual({ ok: true, answer: ANSWER })
  expect(host.controller.fork).toHaveBeenCalledWith({ sessionId: worker })
  // The forked Session is renamed for the Ticket and gets exactly the four read-only tools plus the answer prompt.
  expect(host.controller.rename).toHaveBeenCalledWith({ sessionId: FORKED, title: `Ticket question · ${ticket.title}` })
  expect(host.restrictions.get(FORKED)?.at(-1)).toEqual(['read', 'read_image', 'glob', 'grep'])
  const section = host.sections.get(FORKED)!
  expect(section.complete).toBe(true)
  expect(section.text({})).toContain('Answer one question about this Ticket')
  expect(host.archiveSession).toHaveBeenCalledWith(FORKED, { stopActivity: true })
  // Asking changed nothing: the same Ticket, and no Trigger or Decision around it.
  const after = host.runtime.store.tickets.get(ticket.id)!
  expect(after).toEqual(ticket)
  expect([after.inputs, after.assignments, after.ended, after.updatedAt])
    .toEqual([ticket.inputs, ticket.assignments, ticket.ended, ticket.updatedAt])
  expect(after.assignments).toHaveLength(ticket.assignments.length)
  expect(host.runtime.store.read.recentTriggers(0, 100)).toHaveLength(triggers)
  expect(host.runtime.store.decisions.byThread(thread)).toHaveLength(decisions)
})

it('refuses a Ticket whose worker Session does not exist, without forking', async () => {
  const { ticket, sessionId: worker } = await host.acceptedTicket(feishu('2', '@bot 修一下回归'))
  // A Ticket stored before this host ever started its worker: its Session neither exists nor is created by asking.
  host.agents.delete(worker)
  await expect(questions().ask(ticket, QUESTION)).resolves.toMatchObject({ ok: false, reason: 'no-session' })
  expect(host.controller.fork).not.toHaveBeenCalled()
  expect(host.archiveSession).not.toHaveBeenCalled()
})

it('refuses a worker Session without a completed turn, without forking', async () => {
  const { ticket, sessionId: worker } = await host.acceptedTicket(feishu('3', '@bot 修一下回归'))
  append(worker, { type: 'turn/start', time: 1, data: { turn: 1 } })
  await expect(questions().ask(ticket, QUESTION)).resolves.toMatchObject({ ok: false, reason: 'no-completed-turn' })
  expect(host.controller.fork).not.toHaveBeenCalled()
})

it('times out a question whose turn never ends, cancels it and archives the forked Session', async () => {
  const { ticket, sessionId: worker } = await host.acceptedTicket(feishu('4', '@bot 修一下回归'))
  completedTurn(worker)
  await expect(questions().ask(ticket, QUESTION, { timeoutMs: 20 })).resolves.toMatchObject({ ok: false, reason: 'timeout' })
  expect(host.deliveries).toHaveBeenCalledWith(expect.objectContaining({ sessionId: FORKED, mode: 'queue', text: QUESTION }))
  expect(host.agents.get(FORKED)!.cancel).toHaveBeenCalledWith({ kind: 'user' })
  expect(host.archiveSession).toHaveBeenCalledWith(FORKED, { stopActivity: true })
})

it('reports a failed fork with its message, and archives nothing', async () => {
  const { ticket, sessionId: worker } = await host.acceptedTicket(feishu('5', '@bot 修一下回归'))
  completedTurn(worker)
  vi.mocked(host.controller.fork).mockRejectedValueOnce(new Error('fork refused'))
  await expect(questions().ask(ticket, QUESTION)).resolves
    .toMatchObject({ ok: false, reason: 'fork-failed', message: expect.stringContaining('fork refused') })
  expect(host.archiveSession).not.toHaveBeenCalled()
})

it('reports an empty answer and archives the forked Session', async () => {
  const { ticket, sessionId: worker } = await host.acceptedTicket(feishu('6', '@bot 修一下回归'))
  completedTurn(worker)
  const asked = questions().ask(ticket, QUESTION)
  await delivered()
  // Its turn ends without an assistant message after the inherited prefix.
  host.agents.get(FORKED)!.status = 'idle'
  await expect(asked).resolves.toMatchObject({ ok: false, reason: 'empty-answer' })
  expect(host.archiveSession).toHaveBeenCalledWith(FORKED, { stopActivity: true })
})
