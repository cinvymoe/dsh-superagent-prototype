/** The discussion Answerer: how long it waits, and what a turn that stops producing output looks like. */
import { describe, expect, it, vi } from 'vitest'
import { Answerer, type AnswererHost } from '../src/app/answerer.ts'
import type { LocalAnswer, LocalDiscussion } from '../src/sources/local-format.ts'

const discussion: LocalDiscussion = { id: 'd-one', title: 'Design the layout', body: 'Body', author: 'person',
  project: 'p-one', createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z', state: 'open' }

const message: LocalAnswer = { id: 'an-one', discussionId: 'd-one', triggerId: 't-one', text: 'Take a look at this',
  at: '2026-09-24T00:00:01.000Z', state: 'queued' }

/** An Agent whose log a spec appends to, and whose turn settles when the spec says so. */
function fakeAgent() {
  const events: { type: string; seq: number; data: unknown }[] = []
  let settle: () => void = () => {}
  const idle = new Promise<void>(resolve => { settle = resolve })
  const agent = {
    status: 'running',
    session: { snapshotEvents: () => [...events] },
    whenIdle: () => idle,
    cancel: vi.fn(),
  }
  /** Record one assistant message, which is also what the Answerer reads as the answer. */
  const say = (text: string): void => {
    events.push({ type: 'assistant/message', seq: events.length,
      data: { message: { content: [{ type: 'text', text }] } } })
  }
  return { agent, say, finish: () => { settle() }, events }
}

function host(agent: unknown, overrides: Partial<AnswererHost> = {}): AnswererHost {
  return {
    workspace: () => '/tmp',
    sessions: { ensureAnswerer: async () => agent as never, prompt: async () => {} },
    ...overrides,
  }
}

describe('discussion Answerer', () => {
  it('keeps waiting while the turn keeps appending events, past the silence window', async () => {
    const { agent, say, finish } = fakeAgent()
    // A long answer: one new event every 20ms for 200ms, far longer than the 60ms silence window.
    const timer = setInterval(() => say('still reading'), 20)
    setTimeout(() => { clearInterval(timer); say('The layout splits into two columns'); finish() }, 200)

    const result = await new Answerer(host(agent, { timeoutMs: 60 })).answer(discussion, message)

    expect(result).toEqual({ ok: true, answer: 'The layout splits into two columns' })
    expect(agent.cancel).not.toHaveBeenCalled()
  })

  it('reports a turn that stops producing output, and cancels it', async () => {
    const { agent } = fakeAgent()
    const result = await new Answerer(host(agent, { timeoutMs: 40 })).answer(discussion, message)

    expect(result).toMatchObject({ ok: false, reason: 'timeout' })
    expect(result).toHaveProperty('message', 'The discussion Answerer produced no output for 0s')
    expect(agent.cancel).toHaveBeenCalledWith({ kind: 'hook', reason: 'discussion-answer-timeout' })
  })

  it('reports an interrupted answer instead of a silent one', async () => {
    const { agent } = fakeAgent()
    const lifetime = AbortSignal.abort()
    const result = await new Answerer(host(agent, { lifetime })).answer(discussion, message)

    expect(result).toMatchObject({ ok: false, reason: 'timeout', message: 'The discussion Answerer was interrupted' })
    expect(agent.cancel).not.toHaveBeenCalled()
  })

  it('stops a turn that keeps producing output past the overall cap', async () => {
    const { agent, say } = fakeAgent()
    const timer = setInterval(() => say('still reading'), 10)

    const result = await new Answerer(host(agent, { timeoutMs: 40, limitMs: 60 })).answer(discussion, message)

    clearInterval(timer)
    expect(result).toMatchObject({ ok: false, reason: 'timeout' })
    expect(agent.cancel).toHaveBeenCalled()
  })
})
