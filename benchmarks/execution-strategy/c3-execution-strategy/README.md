# C3 regression case: the execution-strategy seam resolves a slice Ticket's tools, guard and prompt

- Ticket: `b81d294563cbe02b2f2ba0b657adfc10` (slice C3 of alignment `q-2f92c878`「执行阶段 feature-exec / 原生开关，默认原生」)
- Branch: `agent/seam-session-b81d294563cb`
- Base: `c68e6e44` (deployment `main`) with the C1 contract branch (PR #18) merged in
- PR: see the PR record under `docs/issues/PR-b81d294563cbe02b2f2ba0b657adfc10.md` (open; a person reviews and merges)
- Scope: the strategy seam only — a new `src/app/execution-strategy.ts` registry resolves `plan.execution` per contract version; `Sessions` and `Prompts.composeExecute` read it instead of testing "the ticket has a plan". Native slices get no `feature_exec_*` tool, no pre-run guard and the `prompts/native-execute.md` handoff; feature-exec slices keep exactly what they had; a ticket without `plan.execution` (dispatched by the old code) still resolves to feature-exec; a host without the `featureExec` service degrades to native.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `docs/issues/review-C3-execution-strategy.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Targeted verification log | `evidence/c3-execution-strategy-targeted.log` |
| Typecheck log | `evidence/c3-execution-strategy-typecheck.log` |
| Full verification log | `evidence/c3-execution-strategy-full.log` |

## How to re-run

```sh
pnpm vitest run tests/execution-strategy.spec.ts tests/prompts.spec.ts
pnpm typecheck
pnpm vitest run tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm test
git diff --check
```

Expected: targeted 2 files / 32 tests pass; typecheck clean; `docs.spec.ts` passes (the 007 Modules/Tests rows); full suite 64 files / 1301 tests pass.

## Visual evidence

None: the slice changes how an Executor Session's tools, guard and prompt are chosen; it renders no UI. The panel switch that makes the mode visible belongs to C4 and carries its own Before/After captures.
