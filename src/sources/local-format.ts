/** Local web source records shared by the source plugin, the panel routes, and the client view types. */

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
  createdAt: string
  updatedAt: string
}

/** The repositories a project shows: its intake → code pair, or the single legacy execution repository. */
export function projectRepositories(project: Pick<LocalProject, 'repository' | 'intakeRepository' | 'codeRepository'>): string {
  return project.codeRepository !== undefined
    ? `${project.intakeRepository ?? project.codeRepository} → ${project.codeRepository}`
    : project.repository ?? ''
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
  status: 'proposed' | 'confirmed' | 'rejected'
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
  createdAt: string
  updatedAt: string
  state: 'open' | 'closed'
  alignment?: LocalAlignment
}
