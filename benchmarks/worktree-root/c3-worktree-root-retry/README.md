# C3 retry regression case: worktree-root documentation

- Ticket: `10cf3eb1cf2bd47e97ffc17239529bc4`（slice C3 of alignment `q-94e6e32e`「Worktree root execution retry」）
- Branch: `agent/worktree-10cf3eb1cf2b`
- Base: `66604aa`（deployment `main`，包含此前 C1/C2/C3 文档里程碑与 C1 `Clear filters` 文档）；工单 worktree 合并该分支后树与 main 一致，再落本切片增量
- Scope: 文档-only retry delta —— 把根目录优先级写成显式链、把 Discuss/Execution 描述对齐面板实际字段、补齐 007 模块/测试表说明，并用 `tests/docs.spec.ts` 锁定这些语义；无 `src/**`、`prompts/**`、locale 或 UI 变化
- PR: _待填_（`pr_status: open`）

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
pnpm install --frozen-lockfile
pnpm vitest run tests/docs.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm test
git diff --check
```

Expected: `tests/docs.spec.ts` 11/11; typecheck clean; full test suite 62 files / 1245 tests passed; no whitespace errors.

## Notes

- No UI change: the retry only makes documentation match the panel and implementation, so this case carries no Before/After screenshots.
- The earlier C3 attempt (PR #6, branch `agent/worktree-1e2ca41e46a5`) is based on an older main and would revert the `Clear filters` documentation line; this case is based on current `main` and contains only the slice delta.
