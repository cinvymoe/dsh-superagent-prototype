# C1 retry regression case: worktree root resolution and startup validation

- Ticket: `0b129da0e330dcbbb344fc21a2393ee2` (slice C1 of alignment `q-94e6e32e`「Worktree root execution retry」)
- Branch: `agent/worktree-0b129da0e330`
- Base: `310ae2e` (deployment `main`, includes C2/C3 and the inherited C1 core from `2e79202`)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/5 (branch `agent/worktree-0b129da0e330`, commit `b910c2e`)
- Scope: retry delta for C1 — `createProject` treats omitted, empty-string and whitespace-only `worktreeRoot` as unconfigured, while a relative path still raises `UserError('projectWorktreeRoot')`; the inherited C1 behavior (root priority, launch validation, failure/retry) is covered by the existing `project worktree roots` tests.

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
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/runtime-concurrency.spec.ts tests/locales.spec.ts
env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm test
```

Expected: typecheck clean; targeted 4 files / 82 tests; full 62 files / 1240 tests. The environment-variable unset avoids two pre-existing host-sensitive assertions (`GIT_CONFIG_GLOBAL`, localized git error text).
