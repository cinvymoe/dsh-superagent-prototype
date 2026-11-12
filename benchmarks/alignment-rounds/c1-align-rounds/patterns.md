# Reusable patterns

## Append-only rounds with a current-round mirror

Keep the history in `alignments` (oldest first) and treat it as the only truth; expose the last element as the legacy `alignment` field on every read so existing readers keep working. Write both on mutation. A record written before the field existed normalizes to one round at read time instead of a migration — the same pattern the execution-mode slice used for absent fields (`docs/issues/review-C2-execution-mode.md`).

Trade-off: readers get a stable shape without a schema change; the cost is a duplicated mirror in the stored JSON, which is harmless because reads rebuild the mirror from the history.

## Deterministic round ids from the history

`al-<n>` with n = rounds + 1, skipping ids already present, is stable, human-readable and needs no clock or counter. A legacy record normalizes to `al-1`, so the next proposal is `al-2` without special cases. A UUID would also work but makes logs and feedback text harder to read.

## Validate the round before any side effect

`decide` checks the optional `roundId` against the current round **before** writing the record or dispatching tickets, so a stale page produces neither a mutation nor a ticket. Over HTTP the existing `UserError` mapping turns it into 400 + `code` + `values.round`; the panel's `errorText` then localizes it from `userError.*` with no new transport.

## Feedback as a human Trigger, not a side channel

A rejection posts `对齐第 N 轮已打回：<reason>` through `host.receive(localTrigger(...))`, the same path as a person's comment. That reuses Thread fan-out, worker delivery and the Aligner Session wake-up for free, and the text is visible in the message timeline. Deduplicate by the round's previous status: a second reject refreshes the record but must not post again.

## Freeze on confirmation, idempotent by construction

A confirmed round is the authorization that dispatched tickets. `propose` refuses with `alignmentConfirmed`; `decide('confirm')` returns early when the round is already confirmed (keeping `decidedAt`); dispatch reuses tickets through `Engine.acceptPlan`. This keeps the "confirm twice dispatches nothing new" invariant without a second flag.

## One reader for the current round

`planInput`, `Runtime.dispatchPlan` and `orchestrator_align` all call `currentAlignment(issue)` instead of reaching into `.alignment`. When a single-slot field becomes a history, the risk is a stale read in some dispatch path; centralizing the read is what the two-axis review checked.
