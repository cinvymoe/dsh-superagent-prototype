# C2 retry regression case: Discuss form and API expose the project worktree root

- Ticket: `1478bf96058ac87a5dcf08731cb9147b` (slice C2 of alignment `q-94e6e32e`「Worktree root execution retry」)
- Branch: `agent/discuss-api-worktree-1478bf96058a`
- Base: `310ae2e` (deployment `main`, includes the C2 production delivery `f4421aa` / PR #3); merge `0546322` makes the branch tree identical to the base before the retry delta
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/8 (commit `ec0d488`, state OPEN)
- Scope: retry delta for C2 — explicit HTTP/jsdom regression coverage for omitted/empty/whitespace-only roots, legacy records in both list and detail, the requirement-detail path display and the localized relative-path refusal. No production code change: C2's behavior already landed in `f4421aa`.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `review.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Raw verification log | `evidence/verification.log` |

## How to re-run

```sh
pnpm typecheck
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/panel-discuss.spec.tsx tests/panel-execution.spec.tsx tests/locales.spec.ts tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck clean; targeted 6 files / 58 tests; full `pnpm check` passes (typecheck + full test suite + build).

## Visual evidence

- Before: `docs/evidence/c2-worktree-root/before-*.png` (`790f12f`, real panel build)
- After: `docs/evidence/c2-worktree-root-retry/after-*.png` (this branch, 1440x1100, light, zh-CN, real panel instance)
- The C2 UI is unchanged by this retry; the pair documents the feature delivery plus the requirement-detail path display.
