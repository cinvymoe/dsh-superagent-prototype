/** Local web source records shared by the source plugin, the panel routes, and the client view types. */

/** Stable sender identity of the built-in local panel, which is a same-origin, owner-operated surface. */
export const LOCAL_SOURCE = 'local'
export const LOCAL_ACTOR = 'local'

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

/** A requirement submitted from the local web panel; its thread key is `local:<id>`. */
export interface LocalIssue {
  id: string
  title: string
  body: string
  author: string
  createdAt: string
  updatedAt: string
  state: 'open' | 'closed'
  alignment?: LocalAlignment
}
