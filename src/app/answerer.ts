/** Runs a discussion's Answerer Session: one read-only Session per discussion, answered turn by turn. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { LocalAnswer, LocalDiscussion, LocalProject } from '../sources/local-format.ts'
import type { Sessions } from './sessions.ts'

/** How long one answer may run without a single new Session event before it counts as stalled; a person may retry it. */
export const ANSWER_TIMEOUT_MS = 120_000

/**
 * The longest one answer may take overall, even while it keeps producing output. Image messages and long read-only
 * research legitimately run for minutes, so the wait follows the Session's events instead of a fixed turn budget.
 */
export const ANSWER_LIMIT_MS = 30 * 60_000

/**
 * The directory a discussion's Answerer Session runs in: the project's configured worktree root when it is an existing
 * directory, otherwise `<stateDir>/discussions/<discussion id>`, created before the Session opens. A configured root that
 * is missing or not a directory falls back instead of failing the answer: an answer only reads the checkout.
 */
export function discussionWorkspace(stateDir: string, project: Pick<LocalProject, 'worktreeRoot'> | undefined, discussionId: string): string {
  const root = project?.worktreeRoot
  if (root && isDirectory(root)) return root
  const directory = join(stateDir, 'discussions', discussionId)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return directory
}

/** Whether `path` exists and is a directory; any error, such as a missing path, reads as not a directory. */
function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory() } catch { return false }
}

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
  /** How long the answer may stay silent before it is treated as stalled. */
  readonly timeoutMs?: number
  /** The overall cap, so an answer that keeps streaming forever still settles. */
  readonly limitMs?: number
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
      const quiet = this.host.timeoutMs ?? ANSWER_TIMEOUT_MS
      const idle = await this.untilIdle(agent, quiet, this.host.limitMs ?? ANSWER_LIMIT_MS, options.signal)
      if (idle === 'aborted') return { ok: false, reason: 'timeout', message: 'The discussion Answerer was interrupted' }
      if (idle === 'stalled') {
        // A turn that stopped producing output is cancelled, so the Session is not left driving into the next answer.
        try { agent.cancel({ kind: 'hook', reason: 'discussion-answer-timeout' }) } catch { /* the turn may have just ended */ }
        return { ok: false, reason: 'timeout', message: `The discussion Answerer produced no output for ${Math.round(quiet / 1000)}s` }
      }
      const reply = this.answerOf(agent.session.snapshotEvents(), from)
      return reply ? { ok: true, answer: reply } : { ok: false, reason: 'empty-answer', message: 'The discussion Answerer produced no text' }
    } catch (error) {
      return { ok: false, reason: 'no-session', message: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * The state the answer's turn reaches: `idle` when it settles, `stalled` when the Session appends nothing for `quietMs`,
   * `aborted` when the host stops. Each new event restarts the silence window, so a long answer that keeps streaming, such
   * as one that reads a pasted image and reasons over it, is not cut off by a fixed budget. A failed turn reads as idle.
   */
  private async untilIdle(agent: Agent, quietMs: number, limitMs: number, signal?: AbortSignal): Promise<'idle' | 'stalled' | 'aborted'> {
    const stop = AbortSignal.any([signal, this.host.lifetime].filter((item): item is AbortSignal => item !== undefined))
    const started = Date.now()
    let seq = agent.session.snapshotEvents().at(-1)?.seq ?? -1
    for (;;) {
      if (stop.aborted) return 'aborted'
      const outcome = await Promise.race([
        agent.whenIdle().then(() => 'idle' as const, () => 'idle' as const),
        this.pause(quietMs, stop).then(() => 'quiet' as const),
      ])
      if (outcome === 'idle') return 'idle'
      if (stop.aborted) return 'aborted'
      const next = agent.session.snapshotEvents().at(-1)?.seq ?? -1
      // A new event means the turn is still working: the silence window starts again from here.
      if (next !== seq) {
        seq = next
        if (Date.now() - started >= limitMs) return 'stalled'
        continue
      }
      return 'stalled'
    }
  }

  /** Wait `ms`, returning early when `stop` aborts. */
  private async pause(ms: number, stop: AbortSignal): Promise<void> {
    if (stop.aborted) return
    await new Promise<void>(resolve => {
      const done = (): void => { clearTimeout(timer); stop.removeEventListener('abort', done); resolve() }
      const timer = setTimeout(done, ms)
      stop.addEventListener('abort', done, { once: true })
    })
  }

  /** The last assistant message produced after `from`, as its text blocks. */
  private answerOf(events: readonly SessionEvent[], from: number): string {
    const last = events.filter(event => event.type === 'assistant/message' && event.seq >= from).at(-1)
    return last?.type === 'assistant/message'
      ? last.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n').trim() : ''
  }
}
