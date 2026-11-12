# C1 regression case: open a linked Ticket's Executor Session from the requirement detail

- Ticket: `e31c18f685181583474b8abb3739bc6b`（slice C1 of alignment `q-b91966d0`）
- Branch: `agent/executor-session-e31c18f68518`
- Base: deployment `main` @ `6ed5fded`
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/23（state OPEN，等人复核合并，未启用 auto-merge）
- Scope: the linked-Tickets (关联工单) section of a requirement detail renders the existing localized **打开 Session / Open Session** button only on Tickets whose Executor Session has started; clicking opens only that Ticket's session; the title link still opens that Ticket's Execution detail; no new locale key, API field or server change.

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
| Targeted verification log | `evidence/targeted.log` |
| Clean-environment full gate | `evidence/check-clean.log` |
| Host-environment gate (3 known env-only failures) | `evidence/check-hostenv.log` |
| Untouched-baseline reproduction of those failures | `evidence/baseline-hostenv.log` |
| Capture stdout (both sides) | `evidence/capture.log` |

## How to re-run

```sh
pnpm vitest run tests/panel-discuss.spec.tsx tests/docs.spec.ts tests/locales.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: targeted 3 files / 41 tests passed; full `pnpm check` exit 0 with 63 files / 1288 tests and a completed build. The new case is the panel test `opens each linked Ticket's started Executor Session from the requirement detail`.

## Visual evidence

- Before: `docs/evidence/e31c-session-buttons/before-detail.png`, `before-linked.png`（deployment `main` @ `6ed5fded`，真实面板构建）
- After: `docs/evidence/e31c-session-buttons/after-detail.png`, `after-linked.png`（本分支 head，1440×1100，浅色，zh-CN，真实面板实例）
- 同一 seed：项目 `Widgets`；需求「导出工单列表为 CSV」；关联工单 3 张，其中 `修复导出权限校验` 与 `导出任务进度提示` 有已启动 Assignment、`补齐导出接口分页` 没有。Before 三行均无按钮；After 仅两张有会话的工单右对齐显示「打开 Session」。
