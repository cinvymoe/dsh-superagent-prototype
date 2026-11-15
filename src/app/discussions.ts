/** Read/write operations for discussions held on their own Threads, before any requirement exists for them. */
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { key, UserError, type ReceiveResult, type Trigger } from '../core/index.ts'
import { KV } from '../kv.ts'
import { localThreadKey, localTrigger } from '../sources/local.ts'
import { LOCAL_ACTOR, type LocalDiscussion, type LocalHandoff, type LocalImage, type LocalImageInput } from '../sources/local-format.ts'
import { discussionImagePath, discussionImagesDir, storeDiscussionImages } from './local-images.ts'
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
   * makes the discussion answer; `triggerId` is the Thread Trigger the message was stored as, and `images` are the ones
   * that message attached.
   */
  answer?(discussion: LocalDiscussion, text: string, triggerId: string, images?: LocalImage[]): void
  /** Archives the discussion's Answerer Session, stopping anything it still runs; an absent Session is not an error. */
  archive?(sessionId: string): Promise<void> | void
  /** Reports a failed archive, which is logged rather than raised so it cannot keep a deleted discussion behind. */
  warn?(message: string): void
  now?(): string
}

export interface DiscussionInput {
  body?: string
  project: string
  author?: string
  /** The requirement the Router opened it about, if any. */
  issueId?: string
  /** Its title, when the record it talks about already has one; otherwise the body's first line names it. */
  title?: string
  /** Images submitted with the opening message; an image-only message is accepted when it attaches one. */
  images?: LocalImageInput[]
}

/**
 * Owns the local discussion records, which live in their own KV family and never in a requirement's own record family.
 * Every discussion gets its own Thread (`local:d-…`); a comment still enters the Engine through a normal human Trigger.
 * A discussion names at most one requirement: the one it created, which `LocalIssues` records here through `link`, or the one
 * the Router opened it about. It never becomes a Ticket itself.
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
   * checked before anything is written, so a refused create leaves no record and no Thread behind. `input.issueId` names the
   * requirement the Router opened it about, and the discussion is stored with that link from the start. Its images are
   * validated and stored before the record exists, and an image-only message is named after its first image's file name.
   */
  create(input: DiscussionInput): LocalDiscussion {
    if (!this.host.store.get(KV.local.project(input.project))) throw new UserError('unknownProject')
    const body = (input.body ?? '').trim()
    const images = input.images ?? []
    const title = input.title?.trim() || requirementTitle(body) || requirementTitle(images[0]?.name ?? '')
    if (!title) throw new UserError('discussionEmpty')
    const at = this.clock()
    const id = `d-${key('local-discussion', at, title, String(this.list().length)).slice(0, 8)}`
    const triggerId = key('local-trigger', id, at)
    // Validate and store every image before the record exists, so one refused image creates nothing.
    const stored = storeDiscussionImages(this.state(), id, triggerId, images)
    const discussion: LocalDiscussion = { id, title, body, author: input.author?.trim() || LOCAL_ACTOR, project: input.project,
      ...(input.issueId ? { issueId: input.issueId } : {}), ...(stored.length ? { images: stored } : {}),
      createdAt: at, updatedAt: at, state: 'open' }
    try { this.host.store.set(KV.local.discussion(id), discussion) }
    catch (error) {
      if (stored.length) rmSync(discussionImagesDir(this.state(), id), { recursive: true, force: true })
      throw error
    }
    try { this.host.receive(localTrigger({ discussion, text: this.messageText(discussion, body, stored), at, id: triggerId })) }
    catch (error) {
      // A delivery the Engine refused leaves no half-created discussion or image bytes behind.
      this.host.store.delete(KV.local.discussion(id))
      if (stored.length) rmSync(discussionImagesDir(this.state(), id), { recursive: true, force: true })
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

  /**
   * Append a human comment to the discussion's Thread; the record keeps its text and only its update time moves. A
   * comment may carry images and no text at all, and its images stay on that message's answer, so the timeline shows
   * them beside that message only. `images` are validated before anything is written.
   */
  comment(id: string, text: string, images: readonly LocalImageInput[] = []): LocalDiscussion | undefined {
    const discussion = this.get(id)
    if (!discussion) return undefined
    const body = text.trim()
    if (!body && !images.length) throw new UserError('answerText')
    const at = this.clock()
    const triggerId = key('local-trigger', id, at, body)
    const stored = storeDiscussionImages(this.state(), id, triggerId, images)
    const updated: LocalDiscussion = { ...discussion, updatedAt: at }
    try {
      this.host.store.set(KV.local.discussion(id), updated)
      this.host.receive(localTrigger({ discussion: updated, text: this.messageText(updated, body, stored), at, id: triggerId }))
    } catch (error) {
      // Only this message's bytes are abandoned; earlier messages keep theirs.
      for (const image of stored) rmSync(discussionImagePath(this.state(), id, image), { force: true })
      throw error
    }
    this.host.answer?.(updated, body, triggerId, stored)
    return updated
  }

  /** The stored bytes and media type of one discussion image, from any of its messages; undefined when unknown. */
  image(id: string, imageId: string): { bytes: Buffer; mediaType: string } | undefined {
    const discussion = this.get(id)
    if (!discussion) return undefined
    const image = [...(discussion.images ?? []), ...(discussion.answers ?? []).flatMap(answer => answer.images ?? [])]
      .find(entry => entry.id === imageId)
    if (!image) return undefined
    try { return { bytes: readFileSync(discussionImagePath(this.state(), id, image)), mediaType: image.mediaType } }
    catch { return undefined }
  }

  /** The state directory every discussion image lives under; a record without one cannot store images. */
  private state(): string {
    if (!this.host.stateDir) throw new Error('A discussion image needs a state directory')
    return this.host.stateDir
  }

  /** The submitted text plus one absolute path per attached image, so the Answerer can read what the message shows. */
  private messageText(discussion: LocalDiscussion, text: string, images: readonly LocalImage[]): string {
    if (!images.length) return text
    const lines = images.map(image =>
      `- ${discussionImagePath(this.state(), discussion.id, image)} (${image.mediaType}, ${image.bytes} bytes)`)
    return text ? `${text}\n\nImages:\n${lines.join('\n')}` : `Images:\n${lines.join('\n')}`
  }

  /**
   * Record the conclusion a person handed to the Aligner, with the alignment ticket it started. The record keeps its state and
   * its messages, so the discussion may keep answering questions after the handoff.
   */
  handoff(id: string, handoff: LocalHandoff): LocalDiscussion | undefined {
    const discussion = this.get(id)
    if (!discussion) return undefined
    const updated: LocalDiscussion = { ...discussion, handoff, updatedAt: handoff.at }
    this.host.store.set(KV.local.discussion(id), updated)
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
    if (this.host.stateDir) {
      rmSync(join(this.host.stateDir, 'discussions', id), { recursive: true, force: true })
      // Every message's images live under the discussion's own directory, whatever the message attached.
      rmSync(discussionImagesDir(this.host.stateDir, id), { recursive: true, force: true })
    }
    return discussion
  }
}
