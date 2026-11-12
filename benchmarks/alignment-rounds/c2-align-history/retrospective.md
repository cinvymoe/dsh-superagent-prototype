# Retrospective · C2

## What went well

- Stacking on C1 before implementation avoided re-implementing the round model; the merge with the newer deployment `main` (derived `LocalIssueView`) was resolved by keeping rounds in `normalized()` and deriving `slicesFinished` in `view()`.
- The independent verification lane re-derived the acceptance from the working tree and caught a real delivery hazard: the index still held an earlier, broken conflict resolution while the worktree was fixed. Staging everything before the merge commit fixed it.
- Reusing `DisclosureRow` gave keyboard and screen-reader behaviour for free.

## What was harder than expected

- The capture environment: the DSH web launch token becomes invalid when the profile's activation reloads, so a capture must follow a fresh start closely; the second profile needed its own port (the copied `webserver` patch kept the source port).
- Two visually identical relative times in a collapsed row looked like a defect in the capture; showing one decisive time fixed it before the final screenshots.
- The panel fixture had to grow host parity (supersede, `alignmentConfirmed`, stale `roundId`, collision-free ids) or the new tests would have validated a protocol the host does not implement.

## Follow-ups

- C4/C5 will add the requirement question history to the same detail card; keep the round card and the question timeline as separate sections.
- A future slice could label the proposal/decision timestamps inside an expanded round.
