# C1 回归案例：需求列表在全部切片工单结束后显示「待关闭」

- Ticket: `687169eff8075350b6a3bf8bf754f7e2`（alignment `q-e421cac7` 的唯一切片 C1）
- Run: `run-mwdqkwle-9`（execute，policy A1）
- Branch: `agent/slice-687169eff807`
- Base / merge: 实现基线 deployment `main` @ `40191e32`；收尾时合并 `main` @ `934a1f07`；head `6c91a4f7`；owner 合并后的 main merge commit `422a21a4`
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/27 （MERGED，由 owner `cinvymoe` 合并，未启用 auto-merge）
- Scope: 需求状态派生（`slicesFinished`）、local 路由视图契约、面板「待关闭」状态标签、双语文案、测试、005/007 文档与同场景 Before/After 截图

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Task contract | `task-contract.md` |
| Two-axis review and criteria evidence | `review.md`（仓库侧另见 `docs/issues/review-C1-pending-close.md`） |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Raw verification logs | `evidence/targeted.log`、`evidence/merge-check.log`、`evidence/check.log`、`evidence/red.log` |
| Capture recipe and label dumps | `evidence/capture-before.log`、`evidence/capture-after.log`、`evidence/seed.mjs`、`evidence/seed.log` |

## How to re-run

```sh
pnpm install --frozen-lockfile
pnpm vitest run tests/local-align.spec.ts tests/panel-discuss.spec.tsx tests/navigation.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
  -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: targeted 6 files / 88 tests; full `pnpm check` = typecheck + 64 files / 1324 tests + build; `git diff --check` clean.

## Visual evidence

- Before: `docs/evidence/c1-pending-close/before-requirements.png` / `before-detail.png`，deployment `main` @ `934a1f07` 的真实面板构建，1440×1100、浅色、zh-CN、种子数据与 After 相同。
- After: `docs/evidence/c1-pending-close/after-requirements.png` / `after-detail.png`，合并后分支 head `6c91a4f7` 的真实面板构建。
- 对照：同一项目 `Widgets` 的四条需求、同一「全部」筛选、同一视口/主题/语言；唯一差异是 finished 行的需求状态标签 `开放` → `待关闭`，对齐标签两侧均为 `已确认`；closed 行两侧均 `已关闭`，live 行均 `开放`，unaligned 行均 `开放` + `待对齐`。
- 说明：截图来自两个隔离的本地 DSH web 实例与一次性 SQLite 种子（非部署实例、无真实 GitHub/Feishu 凭据），两个临时服务在取证后均已停止。
