/** Read/write operations for discussions held on their own Threads, before any requirement exists for them. */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { key, UserError, type ReceiveResult, type Trigger } from '../core/index.ts'
import { KV } from '../kv.ts'
import { localThreadKey, localTrigger } from '../sources/local.ts'
import { LOCAL_ACTOR, type LocalDiscussion } from '../sources/local-format.ts'
import { requirementTitle } from './local.ts'
import type { Store } from './store.ts'

export interface DiscussionsHost {
  readonly store: Pick<Store, 'get' | 'set' | 'delete' | 'keys' | 'threads'>
  /** Directory under which the discussions' own workspaces live, in `discussions/<discussion id>`. */
  readonly stateDir?: string
  /** Delivers a Trigger to the Engine, exactly as a requirement's own messages are delivered. */
  receive(trigger: Trigger): ReceiveResult
  /**
   * Hands one human message to the discussion's Answerer. The Engine never evaluates a discussion Thread, so this is what
   * makes the discussion answer; `triggerId` is the Thread Trigger the message was stored as.
   */
  answer?(discussion: LocalDiscussion, text: string, triggerId: string): void
  /** Archives the discussion's Answerer Session, stopping anything it still runs; an absent Session is not an error. */
  archive?(sessionId: string): Promise<void> | void
  /** Reports a failed archive, which is logged rather than raised so it cannot keep a deleted discussion behind. */
  warn?(message: string): void
  now?(): string
}

export interface DiscussionInput { body?: string; project: string; author?: string }

/**
 * Owns the local discussion records, which live in their own KV family and never in a requirement's own record family.
 * Every discussion gets its own Thread (`local:d-…`); a comment still enters the Engine through a normal human Trigger.
 * A discussion may create at most one requirement, which `LocalIssues` records here through `link`.
 */
export class Discussions {
  constructor(private readonly host: DiscussionsHost) {}

  private clock(): string { return this.host.now?.() ?? new Date().toISOString() }

  /** All discussions, newest first, optionally narrowed to one project. */
  list(project?: string): LocalDiscussion[] {
    return this.host.store.keys(KV.local.discussion.prefix).flatMap(entry => {
      const discussion = this.host.store.get(KV.local.discussion(entry.slice(KV.local.discussion.prefix.length)))
      return discussion && (!project || discussion.project === project) ? [discussion] : []
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  get(id: string): LocalDiscussion | undefined { return this.host.store.get(KV.local.discussion(id)) }

  /** Write a discussion record back, the way the Answering queue records its answers on it. */
  put(discussion: LocalDiscussion): void { this.host.store.set(KV.local.discussion(discussion.id), discussion) }

  /** The Thread every message about this discussion belongs to. */
  thread(id: string): string { return localThreadKey(id) }

  /**
   * Create a discussion from its text and submit that text as the first human Trigger of its own Thread. The project is
   * checked before anything is written, so a refused create leaves no record and no Thread behind.
   */
  create(input: DiscussionInput): LocalDiscussion {
    if (!this.host.store.get(KV.local.project(input.project))) throw new UserError('unknownProject')
    const body = (input.body ?? '').trim()
    const title = requirementTitle(body)
    if (!title) throw new UserError('discussionEmpty')
    const at = this.clock()
    const id = `d-${key('local-discussion', at, title, String(this.list().length)).slice(0, 8)}`
    const discussion: LocalDiscussion = { id, title, body, author: input.author?.trim() || LOCAL_ACTOR, project: input.project,
      createdAt: at, updatedAt: at, state: 'open' }
    this.host.store.set(KV.local.discussion(id), discussion)
    const triggerId = key('local-trigger', id, at)
    try { this.host.receive(localTrigger({ discussion, text: body, at, id: triggerId })) }
    catch (error) {
      // A delivery the Engine refused leaves no half-created discussion behind.
      this.host.store.delete(KV.local.discussion(id))
      throw error
    }
    this.host.answer?.(discussion, body, triggerId)
    return discussion
  }

  /**
   * Record the requirement this discussion created: the discussion keeps its text, state and timestamps, and only the one
   * requirement it may create is written down. A second, different requirement is refused rather than overwriting the link.
   */
  link(id: string, issueId: string): LocalDiscussion | undefined {
    const discussion = this.get(id)
    if (!discussion) return undefined
    if (discussion.issueId !== undefined && discussion.issueId !== issueId) {
      throw new UserError('discussionLinked', { discussion: id, issue: discussion.issueId })
    }
    const linked: LocalDiscussion = { ...discussion, issueId }
    this.host.store.set(KV.local.discussion(id), linked)
    return linked
  }

  /** Append a human comment to the discussion's Thread; the record keeps its text and only its update time moves. */
  comment(id: string, text: string): LocalDiscussion | undefined {
    const discussion = this.get(id)
    if (!discussion) return undefined
    const at = this.clock()
    const updated: LocalDiscussion = { ...discussion, updatedAt: at }
    this.host.store.set(KV.local.discussion(id), updated)
    const triggerId = key('local-trigger', id, at, text)
    this.host.receive(localTrigger({ discussion: updated, text: text.trim(), at, id: triggerId }))
    this.host.answer?.(updated, text.trim(), triggerId)
    return updated
  }

  /** Close the discussion; its Thread and messages stay readable, and no requirement is created or changed. */
  close(id: string): LocalDiscussion | undefined {
    const discussion = this.get(id)
    if (!discussion) return undefined
    const updated: LocalDiscussion = { ...discussion, state: 'closed' as const, updatedAt: this.clock() }
    this.host.store.set(KV.local.discussion(id), updated)
    return updated
  }

  /**
   * Delete a discussion that created no requirement: archive its Answerer Session, drop the record, the Thread with the
   * Triggers that belong only to it, and the fallback workspace under the state directory. A discussion that already
   * created a requirement is refused, because that requirement still names it as its source.
   */
  async delete(id: string): Promise<LocalDiscussion | undefined> {
    const discussion = this.get(id)
    if (!discussion) return undefined
    if (discussion.issueId !== undefined) {
      throw new UserError('discussionRequirement', { discussion: discussion.id, issue: discussion.issueId })
    }
    try { await this.host.archive?.(`answerer-${id}`) }
    catch (error) { this.host.warn?.(`dsh-superagent could not archive the Answerer Session of discussion ${id}: ${error instanceof Error ? error.message : String(error)}`) }
    this.host.store.delete(KV.local.discussion(id))
    this.host.store.threads.remove(this.thread(id))
    // Only the state-directory fallback belongs to the discussion; a configured project root is shared and stays.
    if (this.host.stateDir) rmSync(join(this.host.stateDir, 'discussions', id), { recursive: true, force: true })
    return discussion
  }
}
