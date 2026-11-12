# Retrospective

## What went well

- The task contract fixed the data shape (`ChosenImage`, the create payload, the fixture route) before the lane started; the lane produced the whole panel slice plus six tests in one pass with all gates green.
- Separating the stack merge from the slice commit kept the worktree clean and made the C3 commit reviewable in one place.
- Real-panel captures at the stack baseline show exactly the gap C3 fills: images exist server-side, the panel does not surface them before, does after.

## What cost time

- **Unmerged dependencies.** C1 was still conflicting with `main`, C2 unmerged, and C3 requires both. The branch had to merge two full slices (resolving doc add/add conflicts), which makes the PR a stack rather than a single slice diff.
- **Profile/state isolation.** Reusing a copied DSH profile under the shared `DSH_HOME` hit the workspace plugin's duplicate JSONL session id failure; a stale capture session in two state dirs blocks startup for every new profile. Separate `DSH_HOME` per capture instance and unique ports solved it.
- **Screenshot data seeding.** The first seeded PNG/JPEG used Pillow's default font, which lacks CJK glyphs; regenerating with Noto Sans CJK and replacing the stored bytes made the gallery and thumbnails readable without touching the issue metadata.
- **Evidence log names.** `c3-*.log` already belonged to an earlier C3 ticket; logs were renamed `c3-images-*` before committing so the old evidence stayed intact.

## Follow-ups

- Merge/close #12 and #14, then rebase or re-open this stack; its diff should collapse to commit `184c51ab`.
- Consider drag-and-drop and image reordering as separate enhancements; both were explicitly out of scope.
- C2's Trigger text includes absolute image paths. If requirements are ever shown to non-owner surfaces, that path disclosure needs a separate decision.
