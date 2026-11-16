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

/**
 * The stable id of the Ticket that aligns one local requirement: the discussion's Aligner. A requirement aligns once, so a
 * repeated handoff from the panel returns the same Ticket instead of starting a second Aligner.
 */
export function alignTicketId(issueId: string, round = 1): string {
  // The first round keeps the key a requirement has always used; later sessions get their own Ticket, one round apart.
  return round > 1 ? key('ticket', 'align', issueId, String(round)) : key('ticket', 'align', issueId)
}
