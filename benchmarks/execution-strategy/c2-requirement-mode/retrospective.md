# Retrospective

## What went well

- The frozen criteria were small and observable (default native, one route, one refusal, `plan.execution` on dispatched tickets), so every acceptance criterion maps to one named test assertion and the review could be written from the diff.
- C1 was already merged into the branch before writing any code, so `ExecutionMode` / `EXECUTION_STRATEGY_REVISION` / `acceptPlan({ execution })` were real types; no speculative stub was introduced and the stacked PR is honest about merging #18 first.
- The type contract caught the panel-test fixture gap (`'POST local/issues/:id/execution' is missing in type`), which turned into a faithful fixture mirror of the route plus the post-dispatch refusal, ready for C4.
- Red evidence was produced after the fact in a controlled way: stashing only sources and the fixture gave a genuine pre-change failure (4 failed / 33 passed) instead of a claim.
- The full `pnpm check` passed on the first run in this worktree (63 files / 1292 tests, build complete), including the locales parity test that the new error codes would otherwise have broken.

## Pitfalls

- **Subagent lanes can die before they start**: three dispatches (`spawn` default route, `spawn` with an explicit model, `fork`) ended with `failed before it finished` and no closing message, and `git status` showed no tree change. Two plain smoke subagents on the same backend replied `OK`, so this was lane-session-specific, not a broken provider. Check the tree before assuming a lane worked, and record the fallback instead of claiming a lane succeeded.
- **The requirement's absent field must stay absent**: writing `execution: 'native'` in `create()` would have looked harmless but breaks the "legacy record" premise the ticket used for dispatch; the field stays unset until a person chooses, and every reader normalizes.
- **Refusal order matters**: check the mode first, then the dispatched state, then write. Checking dispatch first would make `{ mode: 'garbage' }` on a dispatched requirement report `executionLocked` instead of `executionMode`, which is a worse error for a caller that only typo'd the mode.
- **A JSON `mode` that is not a string** still falls into the shared Zod failure path (`Invalid settings: …`) rather than `executionMode`; the panel only sends strings so this is accepted, but a future API consumer should normalize the type before the domain check. Noted as a limitation, not fixed here to keep the slice local.
- **Scope discipline**: `src/core/*` belongs to C1, `src/client/discuss.tsx` and the panel labels to C4, and `docs/003/005/007` to C5. Touching any of them would have collided with sibling branches; the only test fixture change was forced by the `Api` type.
- **Worktree sharing**: this slice shares the ticket worktree with C1, so no separate lane worktree exists to reclaim, and the branch must be kept until PR #20 merges.

## Test environment three questions

1. No physical device, GUI or screenshot: the case is Node + vitest over SQLite with jsdom only in the panel specs (not run here).
2. No rotation or observation transform is involved.
3. The panel fixture's route mirroring is not a device prerequisite; it is covered by the `Api` type and appears in no other case, so it stays in this case's patterns.
