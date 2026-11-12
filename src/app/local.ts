/** Read/write operations for requirements submitted through the built-in local issue board. */
import { readFileSync, rmSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { key, UserError, type ActorRef, type ReceiveResult, type Thread, type Trigger } from '../core/index.ts'
import { KV } from '../kv.ts'
import { localThreadKey, localTrigger } from '../sources/local.ts'
import { LOCAL_ACTOR, LOCAL_SOURCE, type LocalAlignment, type LocalImage, type LocalImageInput, type LocalIssue, type LocalProject,
  type LocalSlice } from '../sources/local-format.ts'
import type { Store } from './store.ts'
import { requirementImagePath, requirementImagesDir, storeRequirementImages } from './local-images.ts'

export interface LocalIssuesHost {
  readonly store: Pick<Store, 'get' | 'set' | 'keys' | 'read' | 'tickets' | 'triggers' | 'threads'>
  /** Directory under which every requirement's images are stored, in `local-images/<issue id>/`. */
  readonly stateDir: string
  receive(trigger: Trigger): ReceiveResult
  now?(): string
}

export interface LocalIssueInput { title?: string; body?: string; author?: string; project: string; images?: LocalImageInput[] }
export interface LocalProjectInput { name: string; repository: string; worktreeRoot?: string }
export interface LocalAlignmentInput { summary?: string; slices?: LocalSlice[]; acceptance?: string[] }

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/** The title a description yields: its first non-empty line, whitespace collapsed, shortened to 200 characters. */
export function requirementTitle(text: string): string {
  const line = text.split('\n').find(item => item.trim()) ?? ''
  return line.trim().replace(/\s+/g, ' ').slice(0, 200)
}

/** Owns the local issue records; every comment still enters the Engine through a normal human Trigger. */
export class LocalIssues {
  constructor(private readonly host: LocalIssuesHost) {}

  private clock(): string { return this.host.now?.() ?? new Date().toISOString() }

  /** All local issues, newest first, optionally narrowed to one project. */
  list(project?: string): LocalIssue[] {
    return this.host.store.keys(KV.local.issue.prefix).flatMap(entry => {
      const issue = this.host.store.get(KV.local.issue(entry.slice(KV.local.issue.prefix.length)))
      return issue && (!project || issue.project === project) ? [issue] : []
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** All projects, newest first. */
  projects(): LocalProject[] {
    return this.host.store.keys(KV.local.project.prefix).flatMap(entry => {
      const project = this.host.store.get(KV.local.project(entry.slice(KV.local.project.prefix.length)))
      return project ? [project] : []
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  project(id: string): LocalProject | undefined { return this.host.store.get(KV.local.project(id)) }

  /** Create a project; its repository is the only execution target for requirements in it. */
  createProject(input: LocalProjectInput): LocalProject {
    const name = input.name.trim()
    const repository = input.repository.trim()
    if (!REPOSITORY.test(repository)) throw new UserError('projectRepository')
    if (this.projects().some(project => project.name.toLowerCase() === name.toLowerCase())) throw new UserError('projectTaken', { name })
    // Omitted, empty and whitespace-only all mean no project root; any other value must name an absolute directory.
    // Existence and writability are checked at a ticket's launch, not here, because the root may not exist yet when the
    // project is made.
    const trimmedRoot = input.worktreeRoot?.trim()
    const worktreeRoot = trimmedRoot ? trimmedRoot : undefined
    if (worktreeRoot !== undefined && !isAbsolute(worktreeRoot)) throw new UserError('projectWorktreeRoot')
    const at = this.clock()
    const project: LocalProject = {
      id: `p-${key('local-project', at, name).slice(0, 8)}`, name, repository, ...(worktreeRoot !== undefined ? { worktreeRoot } : {}),
      createdAt: at, updatedAt: at,
    }
    this.host.store.set(KV.local.project(project.id), project)
    return project
  }

  get(id: string): LocalIssue | undefined { return this.host.store.get(KV.local.issue(id)) }

  thread(id: string): string { return localThreadKey(id) }

  /** Create the issue and submit its original requirement as the first Trigger of its Thread. */
  create(input: LocalIssueInput): LocalIssue {
    if (!this.project(input.project)) throw new UserError('unknownProject')
    const description = (input.body ?? '').trim()
    // A title given by an older caller wins; a description-only submission names itself after its first non-empty line.
    const title = input.title?.trim() || requirementTitle(description)
    if (!title) throw new UserError('issueEmpty')
    const at = this.clock()
    const id = `q-${key('local-issue', at, title, String(this.list().length)).slice(0, 8)}`
    // Validate and store every image before the record exists, so one refused image creates nothing.
    const images = storeRequirementImages(this.host.stateDir, id, input.images ?? [])
    const issue: LocalIssue = {
      id, title, body: description, author: input.author?.trim() || LOCAL_ACTOR,
      project: input.project, ...(images.length ? { images } : {}), createdAt: at, updatedAt: at, state: 'open',
    }
    try { this.host.store.set(KV.local.issue(id), issue) }
    catch (error) {
      if (images.length) rmSync(requirementImagesDir(this.host.stateDir, id), { recursive: true, force: true })
      throw error
    }
    // A derived title is already the description's first line, so the thread's original message is the description once,
    // without prefixing a copy of it; an explicit title keeps its separate heading.
    this.host.receive(localTrigger({ issue, text: this.requirementText(issue, Boolean(input.title?.trim())), at,
      id: key('local-trigger', id, at) }))
    return issue
  }

  /** The submitted text plus one absolute path per image, so a worker can read the image the person attached. */
  private requirementText(issue: LocalIssue, explicitTitle: boolean): string {
    const text = !issue.body ? issue.title : explicitTitle ? `${issue.title}\n\n${issue.body}` : issue.body
    const images = issue.images ?? []
    const lines = images.map(image => `- ${requirementImagePath(this.host.stateDir, issue.id, image)} (${image.mediaType}, ${image.bytes} bytes)`)
    return images.length ? `${text}\n\nImages:\n${lines.join('\n')}` : text
  }

  /** The stored bytes and media type of one requirement image; undefined for an unknown issue, image or missing file. */
  image(id: string, imageId: string): { bytes: Buffer; mediaType: string } | undefined {
    const image = this.get(id)?.images?.find(entry => entry.id === imageId)
    if (!image) return undefined
    try { return { bytes: readFileSync(requirementImagePath(this.host.stateDir, id, image)), mediaType: image.mediaType } }
    catch { return undefined }
  }

  /** Append a human comment to the issue Thread; it can wake an idle Ticket or start a fresh Eval. */
  comment(id: string, text: string): LocalIssue | undefined {
    const issue = this.get(id)
    if (!issue) return undefined
    const at = this.clock()
    const updated = { ...issue, updatedAt: at }
    this.host.store.set(KV.local.issue(id), updated)
    this.host.receive(localTrigger({ issue: updated, text: text.trim(), at, id: key('local-trigger', id, at, text) }))
    return updated
  }

  /** The issue a worker ticket belongs to, when its origin is this local Source. */
  issueOfTicket(ticketId: string): LocalIssue | undefined {
    const ticket = this.host.store.tickets.get(ticketId)
    const trigger = ticket && this.host.store.triggers.get(ticket.origin.triggerId)
    const thread = trigger?.threads.find(ref => ref.source === LOCAL_SOURCE)
    return thread ? this.get(thread.id) : undefined
  }

  /** Attach the Aligner's proposal to the local issue a worker ticket belongs to. */
  proposeForTicket(ticketId: string, input: LocalAlignmentInput): LocalIssue | undefined {
    const issue = this.issueOfTicket(ticketId)
    return issue ? this.propose(issue.id, input) : undefined
  }

  /** The inputs a confirmed plan dispatches with: the issue thread, its human triggers, and the author. */
  planInput(id: string): { thread: Thread; triggerIds: string[]; actor: ActorRef } | undefined {
    const issue = this.get(id)
    if (!issue?.alignment || issue.alignment.status !== 'confirmed') return undefined
    const thread = this.host.store.threads.get(this.thread(id))
    if (!thread) return undefined
    const triggerIds = this.host.store.read.threadTriggers(thread.key, 200)
      .filter(trigger => trigger.source === LOCAL_SOURCE && trigger.human).map(trigger => trigger.id)
    if (!triggerIds.length) return undefined
    return { thread, triggerIds, actor: { source: LOCAL_SOURCE, id: issue.author || LOCAL_ACTOR } }
  }

  /** Attach the Aligner's proposal; a person later confirms or rejects it in the panel. */
  propose(id: string, input: LocalAlignmentInput): LocalIssue | undefined {
    const issue = this.get(id)
    if (!issue) return undefined
    const at = this.clock()
    const alignment: LocalAlignment = {
      status: 'proposed', summary: (input.summary ?? '').trim(), slices: input.slices ?? [], acceptance: input.acceptance ?? [],
      proposedAt: at,
    }
    const updated = { ...issue, alignment, updatedAt: at }
    this.host.store.set(KV.local.issue(id), updated)
    return updated
  }

  /** Record the person's review of the alignment proposal without letting the panel edit its content. */
  decide(id: string, decision: 'confirm' | 'reject', reason?: string): LocalIssue | undefined {
    const issue = this.get(id)
    if (!issue?.alignment) return undefined
    if (decision === 'confirm' && !issue.alignment.slices.length) throw new UserError('planEmpty')
    const at = this.clock()
    const alignment: LocalAlignment = {
      ...issue.alignment, status: decision === 'confirm' ? 'confirmed' : 'rejected', decidedAt: at,
      ...(decision === 'reject' && reason?.trim() ? { reason: reason.trim() } : {}),
    }
    const updated = { ...issue, alignment, updatedAt: at }
    this.host.store.set(KV.local.issue(id), updated)
    return updated
  }

  close(id: string): LocalIssue | undefined {
    const issue = this.get(id)
    if (!issue) return undefined
    const at = this.clock()
    const updated = { ...issue, state: 'closed' as const, updatedAt: at }
    this.host.store.set(KV.local.issue(id), updated)
    return updated
  }
}
