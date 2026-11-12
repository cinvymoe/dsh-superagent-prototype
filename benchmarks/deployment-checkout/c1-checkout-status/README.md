# C1 regression case: the running checkout's read-only status

- Ticket: `2b9bf67f6fd82b0720ed7644ef721c67` (slice C1 of alignment `q-3603edff`「本地合入并生效」)
- Branch: `agent/get-deployment-checkout-2b9bf67f6fd82b0720ed7644ef721c67`
- Base: `40191e32` (deployment `main`)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/28 (open; a person reviews and merges)
- Scope: the read side only — a new `src/app/checkout.ts` and `GET deployment/checkout`. The merge action, the restart and the panel belong to later slices.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `docs/issues/review-C1-checkout.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Red log (new assertions against the pre-change sources) | `docs/issues/evidence/c1-checkout-red.log` |
| Targeted verification log | `docs/issues/evidence/c1-checkout-targeted.log` |
| Typecheck log | `docs/issues/evidence/c1-checkout-typecheck.log` |
| Related regression log | `docs/issues/evidence/c1-checkout-regression.log` |
| Full verification log | `docs/issues/evidence/c1-checkout-check.log` |

## How to re-run

```sh
pnpm vitest run tests/checkout.spec.ts
pnpm typecheck
pnpm vitest run tests/http.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts tests/client.spec.tsx
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck clean; targeted 1 file / 19 tests; related regression 4 files / 24 tests; full suite 64 files / 1313 tests plus a complete build.

## Visual evidence

None: the slice reads git facts behind a JSON route and renders no UI. The panel that shows the status, the merge action and the restart carry their own captures in later slices.
