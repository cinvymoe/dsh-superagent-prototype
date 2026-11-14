/** Local web source records shared by the source plugin, the panel routes, and the client view types. */

import type { ExecutionMode } from '../core/model.ts'

/** Stable sender identity of the built-in local panel, which is a same-origin, owner-operated surface. */
export const LOCAL_SOURCE = 'local'
export const LOCAL_ACTOR = 'local'

/** A local project owns its own GitHub repository chain; every requirement in the project executes through it. */
export interface LocalProject {
  id: string
  name: string
  /** GitHub chain id owning this project's repositories; absent on a legacy project that only has `repository`. */
  chain?: string
  /** Repository whose Issues the project receives; absent only on a legacy record. */
  intakeRepository?: string
  /** Repository workers check out and open pull requests in; absent only on a legacy record. */
  codeRepository?: string
  /** Execution repository of a project created before projects owned chains; read-only fallback. */
  repository?: string
  /** Optional absolute root under which new tickets create their worktrees; absent keeps the Executor's root. */
  worktreeRoot?: string
  /**
   * Optional prepare command run once for this project's new ticket directories, with the chosen root as its working
   * directory; absent keeps the Executor's `prepare` setting.
   */
  prepare?: string
  /**
   * Additional command names this project's worker Session may not call, on top of the Executor's own list; absent adds
   * none. Only this project's Session fails such a call, so one project's list never changes another's.
   */
  blockedCommands?: string[]
  createdAt: string
  updatedAt: string
}

/** The repositories a project shows: its intake → code pair, or the single legacy execution repository. */
export function projectRepositories(project: Pick<LocalProject, 'repository' | 'intakeRepository' | 'codeRepository'>): string {
  return project.codeRepository !== undefined
    ? `${project.intakeRepository ?? project.codeRepository} → ${project.codeRepository}`
    : project.repository ?? ''
}

/**
 * A project as the panel receives it: the stored record plus two values derived from its GitHub chain. Neither is
 * stored on the project, because the chain row is the one place a bot is configured.
 */
export interface LocalProjectView extends LocalProject {
  /** GitHub CLI of this project's chain, empty when the chain uses the Source-level CLI. */
  cli?: string
  /** Account that CLI is signed in to, as setup resolved it; absent until setup has resolved the chain. */
  bot?: string
}

/** One task slice produced by the alignment stage of a local requirement. */
export interface LocalSlice {
  id: string
  title: string
  outcome: string
  inScope: string[]
  outOfScope: string[]
  acceptance: string[]
  dependsOn: string[]
  lane: 'full' | 'light'
}

/** Alignment proposal attached to a local issue; humans confirm or reject it without editing it. */
export interface LocalAlignment {
  /** Stable id of this alignment round, such as `al-1`; a decision names the round it applies to. */
  roundId: string
  /**
   * `proposed` awaits a person, `confirmed` dispatched its slices, `rejected` was sent back with a reason, and `superseded`
   * was replaced by a later proposal before a person decided it.
   */
  status: 'proposed' | 'confirmed' | 'rejected' | 'superseded'
  summary: string
  slices: LocalSlice[]
  acceptance: string[]
  proposedAt: string
  decidedAt?: string
  reason?: string
}

/** One image attached to a local requirement; its bytes live under `<stateDir>/local-images/<issue id>/`. */
export interface LocalImage {
  id: string
  /** Original file name the person attached. */
  name: string
  /** Media type sniffed from the bytes: image/png, image/jpeg, image/webp or image/gif. */
  mediaType: string
  /** Size of the stored bytes. */
  bytes: number
}

/** An image as submitted with a requirement: base64 content, original name and declared media type. */
export interface LocalImageInput {
  name: string
  mediaType: string
  /** Standard base64, optionally prefixed with a `data:<type>;base64,` header. */
  data: string
}

/**
 * One question a person asked about a Ticket the requirement dispatched, with the answer recorded on the requirement
 * record rather than on the Ticket: nothing of the Engine sees it.
 */
export interface LocalQuestion {
  id: string
  /** The dispatched Ticket the question is about. */
  ticket: string
  text: string
  status: 'asked' | 'answered' | 'failed'
  askedAt: string
  /** When the question reached this status; absent while it is still `asked`. */
  answeredAt?: string
  /** The answer, once one was read from a Session forked off the Ticket's worker. */
  answer?: string
  /** Why the question failed, so a person may retry it; absent unless it is `failed`. */
  error?: string
}

/** A requirement submitted from the local web panel; its thread key is `local:<id>`. */
export interface LocalIssue {
  id: string
  title: string
  body: string
  author: string
  /** Project that binds this requirement to one execution repository. */
  project?: string
  /** Images attached when the requirement was submitted; absent when there are none. */
  images?: LocalImage[]
  /**
   * The questions people asked about its dispatched Tickets, newest last. Absent when there are none, so records written
   * before questions existed read fine and need no migration.
   */
  questions?: LocalQuestion[]
  /**
   * The execution mode the person chose for the requirement's slice tickets: absent means native, which is also how
   * requirements created before the field existed dispatch.
   */
  execution?: ExecutionMode
  createdAt: string
  updatedAt: string
  state: 'open' | 'closed'
  /** Every alignment round in order, oldest first; the last one is current. Written records keep it and the mirror in step. */
  alignments?: LocalAlignment[]
  /** The current alignment, mirrored for readers of records written before rounds existed; `alignments` is the truth. */
  alignment?: LocalAlignment
}

/** The round id a record written before rounds existed is read as. */
const LEGACY_ROUND_ID = 'al-1'

/**
 * Every alignment round of a requirement, oldest first. Records written before rounds existed carry a single `alignment`
 * slot, which reads as one round; a slot without a round id is normalized to the first round instead of migrating storage.
 */
export function alignmentRounds(issue: Pick<LocalIssue, 'alignment' | 'alignments'>): LocalAlignment[] {
  if (issue.alignments?.length) return issue.alignments
  if (!issue.alignment) return []
  return [issue.alignment.roundId ? issue.alignment : { ...issue.alignment, roundId: LEGACY_ROUND_ID }]
}

/** The round a decision applies to: the last one, or undefined when the requirement has no alignment yet. */
export function currentAlignment(issue: Pick<LocalIssue, 'alignment' | 'alignments'>): LocalAlignment | undefined {
  return alignmentRounds(issue).at(-1)
}

/**
 * A requirement as an HTTP response carries it: the stored record plus whether every slice Ticket of its confirmed
 * alignment ended. The flag is derived when the view is built and never stored, so resuming a Ticket turns it off again
 * and no migration is needed; `LocalIssue` records returned by `runtime.local.get()`/`list()` keep it absent.
 */
export interface LocalIssueView extends LocalIssue {
  slicesFinished: boolean
}

/** The execution mode a requirement runs under: the person's choice, or native when they made none. */
export function requirementExecutionMode(issue: Pick<LocalIssue, 'execution'>): ExecutionMode {
  return issue.execution ?? 'native'
}
