/** Runs a discussion's Answerer Session: one read-only Session per discussion, answered turn by turn. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { LocalAnswer, LocalDiscussion } from '../sources/local-format.ts'
import type { Sessions } from './sessions.ts'

/** How long one answer may take before it is recorded as failed; a person may retry it. */
export const ANSWER_TIMEOUT_MS = 120_000

/** The result of one answer: its text, or why it could not be read. */
export type AnswerResult = { ok: true; answer: string } | { ok: false; reason: 'no-session' | 'timeout' | 'empty-answer'; message: string }

/** The port that answers one discussion message; `Answerer` satisfies it. */
export interface DiscussionAnswerer {
  answer(discussion: LocalDiscussion, answer: LocalAnswer, options?: { signal?: AbortSignal }): Promise<AnswerResult>
}

/** Host dependencies used by `Answerer`. */
export interface AnswererHost {
  /** The workspace that holds the discussion's read-only Session, created on demand. */
  workspace(discussion: LocalDiscussion): string
  readonly sessions: Pick<Sessions, 'ensureAnswerer' | 'prompt'>
  /** Host lifetime; an aborted wait leaves the answer `queued` for the next start. */
  readonly lifetime?: AbortSignal
  readonly timeoutMs?: number
}

/**
 * Answers a discussion's messages in the discussion's own Session. The Session is read-only, holds no Ticket, and never
 * enters the Engine: it reads the project checkout the workspace names and its final message is the answer the panel shows.
 * The same Session answers every later message, so the conversation continues instead of starting over.
 */
export class Answerer implements DiscussionAnswerer {
  /** Attempts each answer already made, so a retry delivers a message the Agent does not take for one already seen. */
  private readonly attempts = new Map<string, number>()

  constructor(private readonly host: AnswererHost) {}

  async answer(discussion: LocalDiscussion, answer: LocalAnswer, options: { signal?: AbortSignal } = {}): Promise<AnswerResult> {
    const sessionId = `answerer-${discussion.id}`
    try {
      const agent = await this.host.sessions.ensureAnswerer(sessionId, this.host.workspace(discussion),
        `Discussion · ${discussion.title}`, discussion)
      const events = agent.session.snapshotEvents()
      const from = (events.at(-1)?.seq ?? -1) + 1
      // A new Session starts with the discussion's own text; a later message reaches the Session that already holds it.
      const text = events.length === 0 ? `## ${discussion.title}\n\n${discussion.body}\n\n${answer.text}` : answer.text
      // A retry sends the same text again; its own request id keeps the delivery from being read as already sent.
      const attempt = (this.attempts.get(answer.id) ?? 0) + 1
      this.attempts.set(answer.id, attempt)
      await this.host.sessions.prompt(sessionId, `answer:${answer.id}:${attempt}`, text, 'queue')
      const idle = await this.untilIdle(agent, this.host.timeoutMs ?? ANSWER_TIMEOUT_MS, options.signal)
      if (!idle) return { ok: false, reason: 'timeout',
        message: `The discussion Answerer did not finish within ${Math.round((this.host.timeoutMs ?? ANSWER_TIMEOUT_MS) / 1000)}s` }
      const reply = this.answerOf(agent.session.snapshotEvents(), from)
      return reply ? { ok: true, answer: reply } : { ok: false, reason: 'empty-answer', message: 'The discussion Answerer produced no text' }
    } catch (error) {
      return { ok: false, reason: 'no-session', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Whether `agent` reaches idle before the timeout or an abort; a failed turn reads as idle. */
  private async untilIdle(agent: Agent, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
    const signals = [signal, this.host.lifetime].filter((item): item is AbortSignal => item !== undefined)
    const limit = AbortSignal.any([...signals, AbortSignal.timeout(timeoutMs)])
    return await new Promise<boolean>(resolve => {
      let settled = false
      const finish = (idle: boolean) => {
        if (settled) return
        settled = true
        limit.removeEventListener('abort', aborted)
        resolve(idle)
      }
      const aborted = () => { finish(false) }
      if (limit.aborted) { finish(false); return }
      limit.addEventListener('abort', aborted, { once: true })
      agent.whenIdle().then(() => finish(true), () => finish(true))
    })
  }

  /** The last assistant message produced after `from`, as its text blocks. */
  private answerOf(events: readonly SessionEvent[], from: number): string {
    const last = events.filter(event => event.type === 'assistant/message' && event.seq >= from).at(-1)
    return last?.type === 'assistant/message'
      ? last.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim() : ''
  }
}
