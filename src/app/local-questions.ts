/** Questions about a requirement's dispatched Tickets, kept on the requirement record and answered in the background. */
import { key, UserError, type Ticket } from '../core/index.ts'
import type { LocalIssue, LocalQuestion } from '../sources/local-format.ts'
import type { LocalIssues } from './local.ts'
import type { Store } from './store.ts'

/** A requirement keeps this many questions; the oldest stay readable once the limit is reached. */
export const QUESTION_LIMIT = 20
/** The longest question text a requirement accepts. */
export const QUESTION_CHARS = 4_000

/** The port that answers one question about a Ticket; `Questions` satisfies it. */
export interface TicketAnswers {
  ask(ticket: Ticket, question: string, options?: { signal?: AbortSignal }): Promise<{ ok: true; answer: string } | { ok: false; reason: string; message: string }>
}

/** Host dependencies used by `LocalQuestions`. */
export interface LocalQuestionsHost {
  /** The Store the Tickets are read from; this port never writes one. */
  readonly store: Pick<Store, 'get' | 'tickets'>
  /** The requirement records this port is the only writer of, through `putIssue`. */
  readonly local: Pick<LocalIssues, 'get' | 'list' | 'putIssue'>
  readonly answers: TicketAnswers
  /** Host lifetime; a stop leaves in-flight questions `asked` for the next start. */
  readonly lifetime?: AbortSignal
  /** Reports an answer that could not be settled at all, which a restart re-queues but which would otherwise go unlogged. */
  warn?(message: string): void
  now?(): string
}

/**
 * Records questions about a requirement's dispatched Tickets and answers them in the background. `ask` writes an `asked`
 * record synchronously and returns, so an HTTP request never waits for a forked Session; the answer lands later as
 * `answered` or `failed` on the same requirement record. Only `KV.local.issue` records are written: no Trigger, Eval,
 * Ticket or Assignment comes from asking, and a restart re-queues every question still `asked`.
 */
export class LocalQuestions {
  private readonly running = new Map<string, Promise<void>>()
  private stopping = false

  constructor(private readonly host: LocalQuestionsHost) {}

  private clock(): string { return this.host.now?.() ?? new Date().toISOString() }

  /**
   * Record a person's question about one of the requirement's dispatched Tickets, then answer it in the background. The
   * Ticket must belong to the requirement and have started a worker Session, because a fork needs a conversation to read.
   */
  ask(issueId: string, ticketId: string, text: string): { issue: LocalIssue; question: LocalQuestion } | undefined {
    const issue = this.host.local.get(issueId)
    if (!issue) return undefined
    const trimmed = text.trim()
    if (!trimmed) throw new UserError('questionText')
    const ticket = this.host.store.tickets.get(ticketId)
    if (!ticket) throw new UserError('unknownTicket')
    if (ticket.plan?.issueId !== issueId) throw new UserError('questionTicket')
    if (!ticket.assignments.some(assignment => assignment.startedAt !== undefined)) throw new UserError('questionNoSession')
    const questions = issue.questions ?? []
    if (questions.length >= QUESTION_LIMIT) throw new UserError('questionLimit', { max: String(QUESTION_LIMIT) })
    const at = this.clock()
    const question: LocalQuestion = {
      id: `qn-${key('local-question', at, issueId, String(questions.length), trimmed).slice(0, 8)}`,
      ticket: ticketId, text: trimmed, status: 'asked', askedAt: at,
    }
    const updated: LocalIssue = { ...issue, questions: [...questions, question], updatedAt: at }
    this.host.local.putIssue(updated)
    this.queue(issueId, question.id)
    return { issue: updated, question }
  }

  /** Re-queue a failed question under the same record, so its place in the requirement's list never changes. */
  retry(issueId: string, questionId: string): { issue: LocalIssue; question: LocalQuestion } | undefined {
    const issue = this.host.local.get(issueId)
    if (!issue) return undefined
    const record = issue.questions?.find(entry => entry.id === questionId)
    if (!record) return undefined
    if (record.status !== 'failed') throw new UserError('questionNotFailed')
    const ticket = this.host.store.tickets.get(record.ticket)
    if (!ticket) throw new UserError('unknownTicket')
    // A retry asks the same question of the same Ticket, so association is checked again but the session need not be
    // running: the record was accepted once and the port reports a worker Session that is gone.
    if (ticket.plan?.issueId !== issueId) throw new UserError('questionTicket')
    const at = this.clock()
    const question: LocalQuestion = { ...record, status: 'asked', askedAt: at }
    delete question.answer
    delete question.error
    delete question.answeredAt
    const updated: LocalIssue = {
      ...issue, questions: (issue.questions ?? []).map(entry => entry.id === questionId ? question : entry), updatedAt: at,
    }
    this.host.local.putIssue(updated)
    this.queue(issueId, questionId)
    return { issue: updated, question }
  }

  /** Re-queue every question a previous start left `asked`; an in-flight answer is never queued twice. */
  resume(): void {
    for (const issue of this.host.local.list()) {
      for (const question of issue.questions ?? []) {
        if (question.status === 'asked') this.queue(issue.id, question.id)
      }
    }
  }

  /** Wait for every pending answer, including those queued while waiting. */
  async idle(): Promise<void> {
    while (this.running.size) await Promise.allSettled([...this.running.values()])
  }

  /** Stop queueing new answers, then wait for the running ones; a question still in flight stays `asked`. */
  async stop(): Promise<void> {
    this.stopping = true
    await this.idle()
  }

  /** Start one answer after the current turn, so the caller that recorded `asked` returns first. */
  private queue(issueId: string, questionId: string): void {
    const entry = `${issueId}:${questionId}`
    if (this.stopping || this.running.has(entry)) return
    const done = Promise.resolve().then(() => this.answer(issueId, questionId))
      // An unexpected error leaves the record `asked`, which a restart re-queues; say so instead of losing it.
      .catch(error => { this.host.warn?.(`Could not answer ${entry}: ${error instanceof Error ? error.message : String(error)}`) })
      .finally(() => { this.running.delete(entry) })
    this.running.set(entry, done)
  }

  /** Read one answer and record it on the requirement, unless the record was retried or the host is stopping. */
  private async answer(issueId: string, questionId: string): Promise<void> {
    const issue = this.host.local.get(issueId)
    const record = issue?.questions?.find(entry => entry.id === questionId)
    if (!issue || record?.status !== 'asked') return
    const ticket = this.host.store.tickets.get(record.ticket)
    if (!ticket) { this.record(issueId, questionId, { status: 'failed', error: `Ticket ${record.ticket} is gone` }); return }
    let result: Awaited<ReturnType<TicketAnswers['ask']>>
    try { result = await this.host.answers.ask(ticket, record.text, this.host.lifetime ? { signal: this.host.lifetime } : undefined) }
    catch (error) { result = { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) } }
    // A stop or a restart leaves the question `asked`, so the next start re-queues it instead of recording a failure.
    if (this.stopping || this.host.lifetime?.aborted) return
    const answer = result.ok ? result.answer.trim() : ''
    this.record(issueId, questionId, result.ok && answer
      ? { status: 'answered', answer }
      : { status: 'failed', error: result.ok ? 'The answer was empty' : result.message })
  }

  /** Write one settled status on its own record, re-reading the issue so concurrent edits to other fields survive. */
  private record(issueId: string, questionId: string, settled: { status: 'answered' | 'failed'; answer?: string; error?: string }): void {
    const issue = this.host.local.get(issueId)
    const record = issue?.questions?.find(entry => entry.id === questionId)
    if (!issue || record?.status !== 'asked') return
    const at = this.clock()
    const question: LocalQuestion = { ...record, ...settled, answeredAt: at }
    const updated: LocalIssue = {
      ...issue, questions: (issue.questions ?? []).map(entry => entry.id === questionId ? question : entry), updatedAt: at,
    }
    this.host.local.putIssue(updated)
  }
}
