/** Stable content-derived identifiers; equal inputs always produce the same id. */
import { createHash } from 'node:crypto'
export function key(...values: string[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 32)
}

/**
 * The stable id of the Ticket a confirmed alignment's slice executes as. Both dispatch and the requirement's derived
 * completion view use it, so the two can never disagree about which Ticket a slice owns.
 */
export function planTicketId(issueId: string, sliceId: string): string {
  return key('ticket', 'plan', issueId, sliceId)
}
