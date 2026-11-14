/** Read/write operations for requirements submitted through the built-in local issue board. */
import { readFileSync, rmSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { key, planTicketId, UserError, EXECUTION_STRATEGY_REVISION, type ActorRef, type ExecutionMode, type ExecutionStrategy,
  type ReceiveResult, type Thread, type Trigger } from '../core/index.ts'
import { WORKER_COMMANDS, commandName } from '../infra/environment.ts'
import { LIMITS } from '../limits.ts'
import { KV } from '../kv.ts'
import { localThreadKey, localTrigger } from '../sources/local.ts'
import { alignmentRounds, currentAlignment, LOCAL_ACTOR, LOCAL_SOURCE, requirementExecutionMode, type LocalAlignment, type LocalImage, type LocalImageInput, type LocalIssue, type LocalIssueView, type LocalProject, type LocalSlice } from '../sources/local-format.ts'
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
export interface LocalProjectInput { name: string; repository: string; worktreeRoot?: string; prepare?: string; blockedCommands?: string[] }
export interface LocalProjectFields { name: string; repository?: string; intakeRepository?: string; codeRepository?: string; chain?: string; worktreeRoot?: string;
  prepare?: string; blockedCommands?: string[] }
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
      return issue && (!project || issue.project === project) ? [this.withRounds(issue)] : []
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

  /** Whether another project already carries this name, ignoring case; `exceptId` is the project being renamed. */
  projectNameTaken(name: string, exceptId?: string): boolean {
    const lowered = name.toLowerCase()
    return this.projects().some(project => project.id !== exceptId && project.name.toLowerCase() === lowered)
  }

  /**
   * Validate and normalize the editable fields of a project: a non-empty name no other project carries, `owner/name`
   * repositories (a code repository, or the legacy execution repository), an optional absolute worktree root, and the
   * optional execution environment (a prepare command and extra blocked commands).
   */
  validateProject(input: LocalProjectFields, except?: LocalProject): LocalProjectFields {
    const name = input.name.trim()
    if (this.projectNameTaken(name, except?.id)) throw new UserError('projectTaken', { name })
    const code = input.codeRepository?.trim() || input.repository?.trim() || ''
    const intake = input.intakeRepository?.trim() || code
    if (!REPOSITORY.test(code)) throw new UserError('projectRepository')
    if (!REPOSITORY.test(intake)) throw new UserError('projectRepository')
    // Omitted, empty and whitespace-only all mean no project root; any other value must name an absolute directory.
    // Existence and writability are checked at a ticket's launch, not here, because the root may not exist yet when the
    // project is made.
    const trimmedRoot = input.worktreeRoot?.trim()
    const worktreeRoot = trimmedRoot ? trimmedRoot : undefined
    if (worktreeRoot !== undefined && !isAbsolute(worktreeRoot)) throw new UserError('projectWorktreeRoot')
    const prepare = this.prepareCommand(input.prepare)
    const blockedCommands = this.blockedCommands(input.blockedCommands)
    return {
      name,
      ...(input.chain !== undefined ? { chain: input.chain } : {}),
      ...(input.repository !== undefined ? { repository: input.repository.trim() } : {}),
      ...(input.codeRepository !== undefined ? { codeRepository: code } : {}),
      ...(input.intakeRepository !== undefined ? { intakeRepository: intake } : {}),
      ...(worktreeRoot !== undefined ? { worktreeRoot } : {}),
      ...(prepare !== undefined ? { prepare } : {}),
      ...(blockedCommands !== undefined ? { blockedCommands } : {}),
    }
  }

  /**
   * A project's own prepare command: trimmed, where empty means unconfigured, and no longer than the Executor's setting.
   * The command itself is neither parsed nor run here; it runs in the chosen root when one of its tickets launches.
   */
  private prepareCommand(value: string | undefined): string | undefined {
    const command = value?.trim()
    if (!command) return undefined
    if (command.length > LIMITS.prepareCommand) throw new UserError('projectPrepare', { max: String(LIMITS.prepareCommand) })
    return command
  }

  /**
   * A project's extra blocked command names: trimmed, blank entries dropped and duplicates removed. Each name passes the
   * Executor's own rule, so a path is not a name and the commands workers need stay available in every project.
   */
  private blockedCommands(names: readonly string[] | undefined): string[] | undefined {
    const unique = [...new Set((names ?? []).map(name => name.trim()).filter(Boolean))]
    const invalid = unique.find(name => !commandName(name))
    if (invalid !== undefined) throw new UserError('projectBlockedCommand', { name: invalid })
    const required = unique.find(name => WORKER_COMMANDS.includes(name))
    if (required !== undefined) throw new UserError('projectBlockedWorkerCommand', { name: required })
    return unique.length ? unique : undefined
  }

  /**
   * Build a project record from validated fields without storing it. A project with an execution repository but no
   * code repository gets a legacy record; one with a code repository owns the chain `fields.chain` names, or its own id.
   */
  draftProject(fields: LocalProjectFields, at = this.clock()): LocalProject {
    const id = `p-${key('local-project', at, fields.name).slice(0, 8)}`
    const project: LocalProject = { id, name: fields.name, createdAt: at, updatedAt: at }
    if (fields.codeRepository !== undefined) {
      project.chain = fields.chain ?? id
      project.intakeRepository = fields.intakeRepository ?? fields.codeRepository
      project.codeRepository = fields.codeRepository
    }
    if (fields.repository !== undefined) project.repository = fields.repository
    if (fields.worktreeRoot !== undefined) project.worktreeRoot = fields.worktreeRoot
    if (fields.prepare !== undefined) project.prepare = fields.prepare
    if (fields.blockedCommands?.length) project.blockedCommands = [...fields.blockedCommands]
    return project
  }

  /** Store a project record, replacing any earlier one with the same id. */
  putProject(project: LocalProject): void { this.host.store.set(KV.local.project(project.id), project) }

  /** The project with some validated fields replaced, without storing it; an absent optional field is cleared. */
  patchProject(project: LocalProject, fields: LocalProjectFields): LocalProject {
    const updated: LocalProject = { ...project, name: fields.name, updatedAt: this.clock() }
    for (const field of ['chain', 'repository', 'intakeRepository', 'codeRepository'] as const) {
      if (fields[field] !== undefined) updated[field] = fields[field]
    }
    if (fields.worktreeRoot === undefined) delete updated.worktreeRoot
    else updated.worktreeRoot = fields.worktreeRoot
    if (fields.prepare === undefined) delete updated.prepare
    else updated.prepare = fields.prepare
    if (!fields.blockedCommands?.length) delete updated.blockedCommands
    else updated.blockedCommands = [...fields.blockedCommands]
    return updated
  }

  /** Create a legacy project; its repository is the only execution target for requirements in it. */
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
    const prepare = this.prepareCommand(input.prepare)
    const blockedCommands = this.blockedCommands(input.blockedCommands)
    const at = this.clock()
    const project: LocalProject = {
      id: `p-${key('local-project', at, name).slice(0, 8)}`, name, repository, ...(worktreeRoot !== undefined ? { worktreeRoot } : {}),
      ...(prepare !== undefined ? { prepare } : {}), ...(blockedCommands !== undefined ? { blockedCommands } : {}),
      createdAt: at, updatedAt: at,
    }
    this.host.store.set(KV.local.project(project.id), project)
    return project
  }

  /** The requirement with its alignment rounds read back; a record written before rounds existed reads as one round. */
  get(id: string): LocalIssue | undefined {
    const issue = this.host.store.get(KV.local.issue(id))
    return issue ? this.withRounds(issue) : undefined
  }

  /** A stored record as readers see it: rounds materialized and the single-slot mirror pointing at the current round. */
  private withRounds(issue: LocalIssue): LocalIssue {
    const rounds = alignmentRounds(issue)
    if (!rounds.length) return issue
    return { ...issue, alignments: rounds, alignment: rounds[rounds.length - 1]! }
  }

  /** Store a requirement record, replacing any earlier one with the same id; the caller owns every field it changes. */
  putIssue(issue: LocalIssue): void { this.host.store.set(KV.local.issue(issue.id), issue) }

  /**
   * The HTTP view of a requirement: its stored record, its alignment rounds read back, plus whether every slice Ticket of
   * its confirmed alignment ended. Derived on read, so no migration or extra store field exists. A requirement without a
   * confirmed alignment, one whose alignment has no slices, or one whose slice has no Ticket reports false rather than
   * guessing that it finished. Both an Executor's end and a person's stop count, because the Ticket record only carries
   * `ended`.
   */
  view(issue: LocalIssue): LocalIssueView {
    const materialized = this.withRounds(issue)
    const slices = materialized.alignment?.status === 'confirmed' ? materialized.alignment.slices : []
    const slicesFinished = slices.length > 0
      && slices.every(slice => !!this.host.store.tickets.get(planTicketId(issue.id, slice.id))?.ended)
    return { ...materialized, slicesFinished }
  }

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
    // without prefixing a copy of it; an explicit title keeps its separate heading. Images add their absolute paths.
    const text = !description ? title : input.title?.trim() ? `${title}\n\n${description}` : description
    this.host.receive(localTrigger({ issue, text: this.requirementText(issue, text), at, id: key('local-trigger', id, at) }))
    return issue
  }

  /** The submitted text plus one absolute path per image, so a worker can read the image the person attached. */
  private requirementText(issue: LocalIssue, text: string): string {
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

  /** The execution strategy the requirement dispatches under: its current mode pinned to the contract revision. */
  executionStrategy(issue: Pick<LocalIssue, 'execution'>): ExecutionStrategy {
    return { mode: requirementExecutionMode(issue), version: EXECUTION_STRATEGY_REVISION }
  }

  /** Whether the requirement already dispatched slice tickets; from then on its execution mode stays fixed. */
  private dispatched(id: string): boolean {
    return this.host.store.tickets.list().some(ticket => ticket.plan?.issueId === id)
  }

  /**
   * Change the execution mode a requirement dispatches under. Only the two known modes are valid, and a requirement that
   * already dispatched tickets keeps the mode it had; both refusals leave the record untouched.
   */
  setExecution(id: string, mode: string): LocalIssue | undefined {
    const issue = this.get(id)
    if (!issue) return undefined
    if (mode !== 'native' && mode !== 'feature-exec') throw new UserError('executionMode')
    if (this.dispatched(id)) throw new UserError('executionLocked')
    const updated: LocalIssue = { ...issue, execution: mode as ExecutionMode, updatedAt: this.clock() }
    this.host.store.set(KV.local.issue(id), updated)
    return updated
  }

  /** The inputs a confirmed plan dispatches with: the issue thread, its human triggers, the author and its execution strategy. */
  planInput(id: string): { thread: Thread; triggerIds: string[]; actor: ActorRef; execution: ExecutionStrategy } | undefined {
    const issue = this.get(id)
    if (!issue || currentAlignment(issue)?.status !== 'confirmed') return undefined
    const thread = this.host.store.threads.get(this.thread(id))
    if (!thread) return undefined
    const triggerIds = this.host.store.read.threadTriggers(thread.key, 200)
      .filter(trigger => trigger.source === LOCAL_SOURCE && trigger.human).map(trigger => trigger.id)
    if (!triggerIds.length) return undefined
    return { thread, triggerIds, actor: { source: LOCAL_SOURCE, id: issue.author || LOCAL_ACTOR }, execution: this.executionStrategy(issue) }
  }

  /** Attach the Aligner's proposal as a new round; the person later confirms or rejects the latest one in the panel. */
  propose(id: string, input: LocalAlignmentInput): LocalIssue | undefined {
    const issue = this.get(id)
    if (!issue) return undefined
    // A confirmed requirement is frozen: its slices already dispatched, so a later proposal would silently bypass the decision.
    const rounds = alignmentRounds(issue)
    if (rounds.at(-1)?.status === 'confirmed') throw new UserError('alignmentConfirmed')
    const at = this.clock()
    const used = new Set(rounds.map(round => round.roundId))
    let round = rounds.length + 1
    while (used.has(`al-${round}`)) round++
    const alignment: LocalAlignment = {
      roundId: `al-${round}`, status: 'proposed', summary: (input.summary ?? '').trim(), slices: input.slices ?? [],
      acceptance: input.acceptance ?? [], proposedAt: at,
    }
    // A new proposal supersedes the previous undecided one; confirmed and rejected rounds keep their recorded outcome.
    const alignments = [...rounds.map(previous => previous.status === 'proposed'
      ? { ...previous, status: 'superseded' as const } : previous), alignment]
    const updated = { ...issue, alignments, alignment, updatedAt: at }
    this.host.store.set(KV.local.issue(id), updated)
    return updated
  }

  /**
   * Record the person's review of the current alignment round without letting the panel edit its content. A decision naming
   * another round is refused before anything is written; only the reject of a round that was not already rejected tells the
   * requirement's Thread, so its Aligner hears the feedback once and can propose again.
   */
  decide(id: string, decision: 'confirm' | 'reject', reason?: string, roundId?: string): LocalIssue | undefined {
    const issue = this.get(id)
    if (!issue) return undefined
    const rounds = alignmentRounds(issue)
    const current = rounds.at(-1)
    if (!current) return undefined
    if (roundId !== undefined && roundId !== current.roundId) throw new UserError('alignmentRoundStale', { round: roundId })
    if (decision === 'confirm') {
      if (!current.slices.length) throw new UserError('planEmpty')
      // A repeated confirmation changes nothing, decidedAt included, and dispatches no new work.
      if (current.status === 'confirmed') return issue
    }
    const at = this.clock()
    const text = reason?.trim()
    const decided: LocalAlignment = {
      ...current, status: decision === 'confirm' ? 'confirmed' : 'rejected', decidedAt: at,
      ...(decision === 'reject' && text ? { reason: text } : {}),
    }
    const updated = { ...issue, alignments: [...rounds.slice(0, -1), decided], alignment: decided, updatedAt: at }
    this.host.store.set(KV.local.issue(id), updated)
    if (decision === 'reject' && current.status !== 'rejected') {
      const feedback = this.rejectionFeedback(rounds.length, text)
      this.host.receive(localTrigger({ issue: updated, text: feedback, at, id: key('local-trigger', updated.id, at, feedback) }))
    }
    return updated
  }

  /** The human message a rejection posts on the requirement's Thread so the Aligner receives the reason it was sent back for. */
  private rejectionFeedback(round: number, reason?: string): string {
    return reason ? `对齐第 ${round} 轮已打回：${reason}` : `对齐第 ${round} 轮已打回，请调整后重新对齐。`
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
