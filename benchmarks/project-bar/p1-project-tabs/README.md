# P1 回归案例：顶部项目 Tab、更多菜单与独立新建项目界面

- Ticket: `72eef87fa22817c7628e4a74ecffb1a0`（alignment `q-539e143e` 的 P1 slice）
- Branch: `agent/tab-72eef87fa228`
- Base: deployment `main` @ `3b8c6a8`（已合并 PR #9）
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/10 （OPEN；由人复核合并，未启用 auto-merge）
- Scope: 面板顶部项目栏（`role=tab` 项目 Tab、溢出「更多」菜单）、独立新建项目页、项目作用域的 Discuss、对应测试与文档

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
| Raw verification log | `evidence/verification.log` |

## How to re-run

```sh
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-panel.spec.tsx tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck clean; targeted 6 files / 38 tests; full `pnpm check` typecheck + 63 files / 1248 tests + build; `git diff --check` clean.

## Visual evidence

- Before: `docs/evidence/p1-project-tabs/before-*.png`, real panel build of deployment `main` @ `3b8c6a8`, 1440×1100 or 900×1100, light, zh-CN.
- After: `docs/evidence/p1-project-tabs/after-*.png`, real panel build of this branch, same scenarios/viewports/theme/locale.
- Pairs: Discuss scope, standalone create page, overflow More (menu open and a hidden project chosen), no-project state; plus an after-only post-create state.
