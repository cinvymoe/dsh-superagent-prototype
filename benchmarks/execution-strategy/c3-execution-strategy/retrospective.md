# Retrospective

## What went well

- The seam landed as one new module plus three one-line reads (`strategy.mode`, `strategy.tools`, `strategy.preRunGuard`), so `Sessions` and `Prompts` no longer name an execution tool anywhere.
- The resolver is pure, so every acceptance rule has a named unit test: legacy absence, pinned native, pinned feature-exec, unknown version, unknown mode, missing host service.
- Testing the real private `workOnly` through a recording tool scope caught the "guard keyed on the strategy alone" mistake before review: the fake allow list is what a host without the feature-exec tools looks like.
- The stack on C1 was mechanical (`git merge agent/ticket-a6e2430d5e8f`), and C1's types and tests already pinned `plan.execution`, so this slice never had to touch `src/core`.

## Pitfalls

- **Subagent lanes can still fail silently**: the spawn lane died with no closing message and no tree change, the second occurrence in this alignment. Check `git status` before assuming a lane did anything, and record the fallback explicitly.
- **A middle optional parameter changes an internal signature**: `composeExecute(config, mode, variables)` breaks any caller that passed `variables` second. It is safe only because every caller is in this repository and was updated; the default keeps the old single-argument meaning. A public export would need the new parameter last or an options object.
- **`&&` on an optional plan yields a falsy non-boolean**: `current?.plan && resolve(...)` is typed `undefined`, not `false`, which the following ternary relies on; keep the resolver's return type honest.
- **Docs prose trails the code by design**: `docs/007` still describes every slice ticket as feature-exec until C5 rewrites it; only the Modules/Tests rows are in this slice so `docs.spec.ts` stays green. Say so in the PR instead of silently leaving stale docs.
- **Scope discipline**: the feature-exec tools, local-requirement storage and the panel switch are C2–C4. Touching any of them here would have overlapped sibling branches.
