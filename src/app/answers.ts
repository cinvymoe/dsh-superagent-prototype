/** Answers of local discussions, kept on the discussion record and produced in the background by its Answerer. */
import { key, UserError } from '../core/index.ts'
import type { LocalAnswer, LocalDiscussion } from '../sources/local-format.ts'
import type { DiscussionAnswerer } from './answerer.ts'
import type { Discussions } from './discussions.ts'

/** How many discussions answer at once; separate from the worker slots, so a discussion never holds one. */
export const ANSWER_CONCURRENCY = 2

/** Host dependencies used by `Answers`. */
export interface AnswersHost {
  /** The discussion records this port is the only writer of besides `Discussions` itself. */
  readonly discussions: Pick<Discussions, 'get' | 'put' | 'list'>
  readonly answerer: DiscussionAnswerer
  /** Host lifetime; a stop leaves in-flight answers `queued` for the next start. */
  readonly lifetime?: AbortSignal
  /** Reports an answer that could not be settled at all, which a restart re-queues but which would otherwise go unlogged. */
  warn?(message: string): void
  now?(): string
}

/**
 * Records the answer to each message of a discussion and produces it in the background. A discussion Thread never reaches
 * Eval, so no Trigger, Decision, Ticket or Assignment comes from talking in one: the message is stored as an ordinary
 * Trigger for the timeline, and this record carries the answer the panel shows. A restart re-queues every answer still open.
 */
export class Answers {
  private readonly running = new Map<string, Promise<void>>()
  private readonly waiting: (() => void)[] = []
  private active = 0
  private stopping = false

  constructor(private readonly host: AnswersHost) {}

  private clock(): string { return this.host.now?.() ?? new Date().toISOString() }

  /**
   * Record one human message of the discussion and answer it in the background. The record is written before the work
   * starts, so a restart or a crash leaves the message with a `queued` answer rather than losing it.
   */
  accept(discussion: LocalDiscussion, text: string, triggerId: string): LocalAnswer {
    const trimmed = text.trim()
    if (!trimmed) throw new UserError('answerText')
    const at = this.clock()
    const answer: LocalAnswer = { id: `an-${key('local-answer', at, discussion.id, triggerId).slice(0, 8)}`,
      discussionId: discussion.id, triggerId, text: trimmed, at, state: 'queued' }
    const current = this.host.discussions.get(discussion.id) ?? discussion
    this.host.discussions.put({ ...current, answers: [...current.answers ?? [], answer] })
    this.queue(answer.discussionId, answer.id)
    return answer
  }

  /** Queue a failed answer again; a person may retry only one that failed. */
  retry(discussionId: string, answerId: string): LocalAnswer | undefined {
    const answer = this.find(discussionId, answerId)
    if (!answer) return undefined
    if (answer.state !== 'failed') throw new UserError('answerNotFailed')
    const updated = this.record(discussionId, answerId, { state: 'queued', failure: undefined })
    this.queue(discussionId, answerId)
    return updated
  }

  /** Queue every answer a previous run left open, so an answer is never silently dropped. */
  resume(): void {
    for (const discussion of this.host.discussions.list()) {
      for (const answer of discussion.answers ?? []) {
        if (answer.state === 'queued' || answer.state === 'answering') {
          this.record(discussion.id, answer.id, answer.state === 'answering' ? { state: 'queued' } : {})
          this.queue(discussion.id, answer.id)
        }
      }
    }
  }

  /** Wait until no answer is running or waiting for a slot. */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running.values()])
  }

  /** Stop accepting work and let the running answers settle; a stop leaves the rest `queued` for the next start. */
  async stop(): Promise<void> {
    this.stopping = true
    // Wake the answers waiting for a slot so they return at once, leaving their records `queued` for the next start.
    this.waiting.splice(0).forEach(resolve => resolve())
    await this.idle()
  }

  private find(discussionId: string, answerId: string): LocalAnswer | undefined {
    return this.host.discussions.get(discussionId)?.answers?.find(item => item.id === answerId)
  }

  /** Replace one answer's fields on its discussion record, and return the new value. */
  private record(discussionId: string, answerId: string, patch: Partial<LocalAnswer>): LocalAnswer | undefined {
    const discussion = this.host.discussions.get(discussionId)
    if (!discussion?.answers) return undefined
    let updated: LocalAnswer | undefined
    const answers = discussion.answers.map(item => {
      if (item.id !== answerId) return item
      updated = { ...item, ...patch }
      return updated
    })
    this.host.discussions.put({ ...discussion, answers })
    return updated
  }

  private queue(discussionId: string, answerId: string): void {
    const task = (async () => {
      await this.acquire()
      try { await this.answer(discussionId, answerId) } finally { this.release() }
    })()
    this.running.set(answerId, task.catch(error => {
      this.host.warn?.(`dsh-superagent could not answer discussion ${discussionId}: ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => { this.running.delete(answerId) }))
  }

  private async answer(discussionId: string, answerId: string): Promise<void> {
    if (this.stopping) return
    const discussion = this.host.discussions.get(discussionId)
    const answer = discussion?.answers?.find(item => item.id === answerId)
    if (!discussion || !answer || answer.state !== 'queued') return
    this.record(discussionId, answerId, { state: 'answering', sessionId: `answerer-${discussionId}` })
    const result = await this.host.answerer.answer(discussion, answer)
    // A stop or a shutdown leaves the answer for the next start instead of recording a failure it did not cause.
    if (this.stopping || this.host.lifetime?.aborted) { this.record(discussionId, answerId, { state: 'queued' }); return }
    if (result.ok) this.record(discussionId, answerId, { state: 'answered', answer: result.answer, answeredAt: this.clock(), failure: undefined })
    else this.record(discussionId, answerId, { state: 'failed', failure: { reason: result.reason, message: result.message } })
  }

  private async acquire(): Promise<void> {
    if (this.active < ANSWER_CONCURRENCY) { this.active++; return }
    await new Promise<void>(resolve => this.waiting.push(resolve))
    this.active++
  }

  private release(): void {
    this.active--
    if (this.stopping) return
    this.waiting.shift()?.()
  }
}
