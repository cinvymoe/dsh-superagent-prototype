/** Read/write operations for requirements submitted through the built-in local issue board. */
import { key, UserError, type ActorRef, type ReceiveResult, type Thread, type Trigger } from '../core/index.ts'
import { KV } from '../kv.ts'
import { localThreadKey, localTrigger } from '../sources/local.ts'
import { LOCAL_ACTOR, LOCAL_SOURCE, type LocalAlignment, type LocalIssue, type LocalProject, type LocalSlice } from '../sources/local-format.ts'
import type { Store } from './store.ts'

export interface LocalIssuesHost {
  readonly store: Pick<Store, 'get' | 'set' | 'keys' | 'read' | 'tickets' | 'triggers' | 'threads'>
  receive(trigger: Trigger): ReceiveResult
  now?(): string
}

export interface LocalIssueInput { title: string; body?: string; author?: string; project: string }
export interface LocalProjectInput { name: string; repository: string }
export interface LocalAlignmentInput { summary?: string; slices?: LocalSlice[]; acceptance?: string[] }

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

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
    const at = this.clock()
    const project: LocalProject = {
      id: `p-${key('local-project', at, name).slice(0, 8)}`, name, repository, createdAt: at, updatedAt: at,
    }
    this.host.store.set(KV.local.project(project.id), project)
    return project
  }

  get(id: string): LocalIssue | undefined { return this.host.store.get(KV.local.issue(id)) }

  thread(id: string): string { return localThreadKey(id) }

  /** Create the issue and submit its original requirement as the first Trigger of its Thread. */
  create(input: LocalIssueInput): LocalIssue {
    if (!this.project(input.project)) throw new UserError('unknownProject')
    const at = this.clock()
    const id = `q-${key('local-issue', at, input.title, String(this.list().length)).slice(0, 8)}`
    const issue: LocalIssue = {
      id, title: input.title.trim(), body: (input.body ?? '').trim(), author: input.author?.trim() || LOCAL_ACTOR,
      project: input.project, createdAt: at, updatedAt: at, state: 'open',
    }
    this.host.store.set(KV.local.issue(id), issue)
    this.host.receive(localTrigger({ issue, text: issue.body ? `${issue.title}\n\n${issue.body}` : issue.title, at,
      id: key('local-trigger', id, at) }))
    return issue
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
