# C2 regression case: local projects own and isolate their GitHub repository chains

- Ticket: `4e2a92d2a5b4c1485e70aa07b8adfd99` (slice C2 of alignment `q-141a6a1e`「每个项目独立 / 旧版单链路删除」)
- Branch: `agent/slice-4e2a92d2a5b4`
- Base: `afab266e` (deployment `main`, includes C1 / PR #11)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/13 (commits `0b6642a6`, `df1ceb57`; state OPEN)
- Scope: each local project owns one GitHub repository chain (chain id = project id); creating/editing a project changes only that chain; project tickets execute through the chain; legacy repository-only projects bind at startup when a chain's code repository matches and otherwise keep their original repository.

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
| Targeted verification log | `evidence/targeted.log` |

## How to re-run

```sh
pnpm typecheck
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/panel-projects.spec.tsx tests/panel-discuss.spec.tsx tests/deployment.spec.ts tests/panel-source.spec.tsx tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck clean; targeted 7 files / 73 tests; full `pnpm check` passes (typecheck + full test suite + build).

## Visual evidence

- Before: `docs/evidence/c2-project-chains/before-project-form.png`, `before-discuss-head.png` (baseline `afab266e`, real panel build)
- After: `docs/evidence/c2-project-chains/after-project-form.png`, `after-discuss-head.png` (this branch, 1440x1100, light, zh-CN, real panel instance)
- The pair shows the single execution-repository field becoming intake + code repository fields and the Discuss page head showing `acme/intake → acme/widgets`.
