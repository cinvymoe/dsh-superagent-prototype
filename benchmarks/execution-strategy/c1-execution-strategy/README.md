# C1 regression case: a dispatched slice ticket pins its execution strategy

- Ticket: `a6e2430d5e8f05448428a7c6a18a71af` (slice C1 of alignment `q-2f92c878`「执行阶段 feature-exec / 原生开关，默认原生」)
- Branch: `agent/ticket-a6e2430d5e8f`
- Base: `95a597cb` (deployment `main`)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/18 (open; a person reviews and merges)
- Scope: core contract only — `Ticket.plan.execution = { mode, version }` is fixed by `Engine.acceptPlan` at dispatch, defaulting to `{ mode: 'native', version: 'execution-v1' }`; a repeated confirmation reuses the ticket and never rewrites the strategy it pinned. Strategy resolution, session tools/prompts, local-requirement storage and the panel are later slices (C2–C5).

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `docs/issues/review-C1-execution-strategy.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Targeted verification log | `evidence/c1-execution-strategy-targeted.log` |
| Typecheck log | `evidence/c1-execution-strategy-typecheck.log` |
| Full verification log | `evidence/c1-execution-strategy-full.log` |

## How to re-run

```sh
pnpm vitest run tests/core-engine.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm test
git diff --check
```

Expected: typecheck clean; targeted 119 tests; full suite 63 files / 1287 tests pass.

## Visual evidence

None: the slice changes the core model, ports and plan dispatch only; it renders no UI. The panel switch that makes the mode visible belongs to C4 and carries its own Before/After captures.
