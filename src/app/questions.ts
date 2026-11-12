/** One-shot Ticket questions: a read-only answer from a Session forked off the Ticket's worker, and why it cannot be answered. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { Ticket } from '../core/index.ts'
import { workerSessionId } from '../executor/dsh.ts'
import type { Sessions } from './sessions.ts'
import type { Store } from './store.ts'

/** Why a question could not be answered; the caller records `failed` and may retry. */
export type QuestionFailureReason = 'no-session' | 'no-completed-turn' | 'fork-failed' | 'timeout' | 'empty-answer'

/** One answer about a Ticket, or why the question could not be answered. */
export type QuestionResult = { ok: true; answer: string } | { ok: false; reason: QuestionFailureReason; message: string }

/** How long a forked Session has to answer before its turn is cancelled, unless the caller names its own limit. */
export const QUESTION_TIMEOUT_MS = 120_000

/** Host dependencies used by `Questions`. */
export interface QuestionsHost {
  /** DSH context: the worker Session, its fork, and the archive the forked Session ends in. */
  readonly context: Context
  /** The Store `ticket` was read from; the port reads nothing from it and never writes it. */
  readonly store: Pick<Store, 'tickets'>
  readonly sessions: Pick<Sessions, 'answer' | 'prompt'>
  /** Host lifetime; a stop aborts a waiting question. */
  readonly lifetime?: AbortSignal
  /** Default wait for one answer, when `ask` names none. */
  readonly timeoutMs?: number
}

/** A message's own text, or the error's text when it is not a message. */
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/**
 * Answers one question about a Ticket without touching it: fork the worker Session (`worker-<ticketId>`) at its latest
 * completed turn, decorate the fork with the answer prompt and only the four reading tools, deliver the question, wait for
 * the answer turn to end, read its assistant message, and archive the fork. A question reaches the Engine not at all: no
 * Trigger, Eval, Ticket or Assignment is written, and the caller keeps the `Ticket` it passes. Adapters above record the
 * answer and its failures; this port is what they call.
 */
export class Questions {
  constructor(private readonly host: QuestionsHost) {}
  /**
   * Answers `question` about `ticket`, waiting up to `options.timeoutMs` (else the host's, else 120 seconds). The forked
   * Session is archived on every path that created it; an archive failure is logged and never changes the answer. A
   * Session-domain failure other than `session/not-found` is raised, because the host cannot be asked at all.
   */
  async ask(ticket: Ticket, question: string, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<QuestionResult> {
    const { context, sessions } = this.host
    const worker = workerSessionId(ticket.id) as SessionId
    const resolved = await context.sessionController.resolveAgent(worker)
    if ('error' in resolved) {
      if (resolved.error.code === 'session/not-found') return { ok: false, reason: 'no-session', message: `Ticket ${ticket.id} has no worker Session yet` }
      throw resolved.error
    }
    let events: readonly SessionEvent[]
    try { events = (await context.sessionController.inspect(worker)).events }
    catch (error) {
      if ((error as { code?: string }).code === 'session/not-found') return { ok: false, reason: 'no-session', message: `Ticket ${ticket.id} has no worker Session yet` }
      throw error
    }
    // A fork selects the latest completed-turn prefix; without one there is no conversation to answer from.
    if (!events.some(event => event.type === 'turn/end')) {
      return { ok: false, reason: 'no-completed-turn', message: `Ticket ${ticket.id}'s worker Session has no completed turn to fork at` }
    }
    let forked: SessionId
    try { forked = (await context.sessionController.fork({ sessionId: worker })).sessionId }
    catch (error) { return { ok: false, reason: 'fork-failed', message: `Could not fork Ticket ${ticket.id}'s worker Session: ${messageOf(error)}` } }
    try {
      const agent = await sessions.answer(forked, ticket)
      // The forked id is unique, so the delivery's request id is too.
      await sessions.prompt(forked, `question:${forked}`, question, 'queue')
      const timeoutMs = options.timeoutMs ?? this.host.timeoutMs ?? QUESTION_TIMEOUT_MS
      if (!await this.untilIdle(agent, timeoutMs, options.signal)) {
        // The turn is abandoned: cancel it, and the `finally` archives the Session before the failure returns.
        try { agent.cancel({ kind: 'user' }) } catch { /* a turn that already ended needs no cancel */ }
        return { ok: false, reason: 'timeout', message: `The answer to Ticket ${ticket.id} did not end within ${timeoutMs}ms` }
      }
      const answer = this.answerOf((await context.sessionController.inspect(forked)).events, agent.session.inheritedEventCount)
      return answer ? { ok: true, answer } : { ok: false, reason: 'empty-answer', message: `The answer to Ticket ${ticket.id} was empty` }
    } finally { await this.archive(forked) }
  }
  /** Whether `agent` reaches idle before `timeoutMs` passes or `signal`/the host lifetime aborts; a failed turn reads as idle. */
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
  /** The last assistant message the forked Session produced after the fork boundary, as its text blocks. */
  private answerOf(events: readonly SessionEvent[], inherited: number): string {
    const last = events.filter(event => event.type === 'assistant/message' && event.seq >= inherited).at(-1)
    return last?.type === 'assistant/message'
      ? last.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim() : ''
  }
  /** Archives the forked Session, stopping anything it still runs; a failure is logged, never raised, so it cannot mask the answer. */
  private async archive(sessionId: SessionId): Promise<void> {
    try { await this.host.context.workspaceRegistry.archiveSession(sessionId, { stopActivity: true }) }
    catch (error) { this.host.context.logger.warn('dsh-superagent could not archive the Session that answered a Ticket question: %s', String(error)) }
  }
}
