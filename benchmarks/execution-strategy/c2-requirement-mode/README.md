# C2 regression case: a requirement stores its execution mode and pins it on dispatch

- Ticket: `5e9fa76642ab9972e1b7b557716ae657` (slice C2 of alignment `q-2f92c878`「执行阶段 feature-exec / 原生开关，默认原生」)
- Branch: `agent/slice-5e9fa76642ab`
- Base: `c68e6e44` (deployment `main`); the branch merged C1 `agent/ticket-a6e2430d5e8f` as `86a9f3ee` first
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/20 (open; merge C1 PR #18 first, a person reviews and merges)
- Scope: requirement-side storage, the management API and the dispatch pass-through only — `LocalIssue.execution` (`native` by default, absent on legacy records), `POST local/issues/:id/execution` before dispatch, and `Runtime.dispatchPlan` passing `{ mode, version: 'execution-v1' }` into `Engine.acceptPlan` so every slice ticket pins the requirement's current mode. Strategy resolution in sessions/prompts (C3), the panel switch (C4) and the product documentation (C5) are later slices.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `docs/issues/review-C2-execution-mode.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Red log (new assertions against the pre-change sources) | `docs/issues/evidence/c2-execution-mode-red.log` |
| Targeted verification log | `docs/issues/evidence/c2-execution-mode-targeted.log` |
| Typecheck log | `docs/issues/evidence/c2-execution-mode-typecheck.log` |
| Related regression log | `docs/issues/evidence/c2-execution-mode-regression.log` |
| Full verification log | `docs/issues/evidence/c2-execution-mode-check.log` |

## How to re-run

```sh
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts
pnpm typecheck
pnpm vitest run tests/locales.spec.ts tests/core-engine.spec.ts tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck clean; targeted 2 files / 37 tests; related regression 3 files / 139 tests; full suite 63 files / 1292 tests plus a complete build.

## Visual evidence

None: the slice stores a requirement field, exposes a management route and propagates a pinned value; it renders no UI. The Discuss switch that makes the mode visible belongs to C4 and carries its own Before/After captures.
