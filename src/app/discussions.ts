/** Read/write operations for discussions held on their own Threads, before any requirement exists for them. */
import { key, UserError, type ReceiveResult, type Trigger } from '../core/index.ts'
import { KV } from '../kv.ts'
import { localThreadKey, localTrigger } from '../sources/local.ts'
import { LOCAL_ACTOR, type LocalDiscussion } from '../sources/local-format.ts'
import { requirementTitle } from './local.ts'
import type { Store } from './store.ts'

export interface DiscussionsHost {
  readonly store: Pick<Store, 'get' | 'set' | 'delete' | 'keys'>
  /** Delivers a Trigger to the Engine, exactly as a requirement's own messages are delivered. */
  receive(trigger: Trigger): ReceiveResult
  now?(): string
}

export interface DiscussionInput { body?: string; project: string; author?: string }

/**
 * Owns the local discussion records, which live in their own KV family and never in a requirement's own record family.
 * Every discussion gets its own Thread (`local:d-…`); a comment still enters the Engine through a normal human Trigger.
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
    try { this.host.receive(localTrigger({ discussion, text: body, at, id: key('local-trigger', id, at) })) }
    catch (error) {
      // A delivery the Engine refused leaves no half-created discussion behind.
      this.host.store.delete(KV.local.discussion(id))
      throw error
    }
    return discussion
  }

  /** Append a human comment to the discussion's Thread; the record keeps its text and only its update time moves. */
  comment(id: string, text: string): LocalDiscussion | undefined {
    const discussion = this.get(id)
    if (!discussion) return undefined
    const at = this.clock()
    const updated: LocalDiscussion = { ...discussion, updatedAt: at }
    this.host.store.set(KV.local.discussion(id), updated)
    this.host.receive(localTrigger({ discussion: updated, text: text.trim(), at, id: key('local-trigger', id, at, text) }))
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
}
