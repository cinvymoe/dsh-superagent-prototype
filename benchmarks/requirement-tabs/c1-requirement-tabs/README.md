# C1 回归案例：拆分新建需求与需求列表两个页签，精简提交页

- Ticket: `de236aab51cc140a2178fc3fe96f2d3c`（alignment `q-612052e8` 的 C1 slice）
- Branch: `agent/slice-de236aab51cc`
- Base: deployment `main` @ `04cb0449`（已合并 PR #10）
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/12 （OPEN；由人复核合并，未启用 auto-merge）
- Scope: 面板页签拆分（新建需求 / 需求列表）、描述派生标题、需求详情返回需求列表、项目切换落点与旧路由迁移，对应测试、文档与 Before/After 截图

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Task contract | `task-contract.md` |
| Two-axis review and criteria evidence | `review.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Raw verification log | `evidence/targeted.log`、`evidence/check.log`、`evidence/full.log` |

## How to re-run

```sh
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-overview.spec.tsx tests/panel-panel.spec.tsx tests/navigation.spec.ts tests/local.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck clean; targeted 9 files / 75 tests; full `pnpm check` typecheck + 63 files / 1259 tests + build; `git diff --check` clean.

## Visual evidence

- Before: `docs/evidence/c1-requirement-tabs/before-*.png`，deployment `main` @ `04cb0449` 的真实面板构建，1440×1100，浅色，zh-CN。
- After: `docs/evidence/c1-requirement-tabs/after-*.png`，本分支 head `f4413fc` 的真实面板构建，同场景/视口/主题/语言。
- 对照：提交页（讨论页 → 新建需求页）、需求列表、详情与返回、Billing 项目切换、独立新建项目页；另有一张 after-only 的「仅提交描述后的详情」。