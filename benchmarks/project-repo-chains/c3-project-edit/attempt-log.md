# Attempt log

| # | 动作 | 结果 |
| --- | --- | --- |
| 1 | 读 C2 分支（`agent/slice-4e2a92d2a5b4`）的 issue/PR/代码，确认 C3 只缺编辑路径 | 确认：`POST`/`PUT local/projects`、四字段创建页、页头/菜单展示均已由 C2 交付 |
| 2 | `git merge agent/slice-4e2a92d2a5b4`（PR #13，head `df875f01`）到本 ticket 分支 | 干净合并，无冲突 |
| 3 | 加 `{ page: 'discuss', edit }` 路由与 `parseRoute` / `routeLabel` | `tsc` 报 `openTab` 的 Route 联合不再成立 |
| 4 | 把 `openTab` 改为每 Tab 显式字面量路由 | `tsc --noEmit` exit 0 |
| 5 | `NewProjectPage` → `ProjectFormPage({ edit })`，预填 + `loaded` 闸门 + PUT/POST 分支 | 面板测试通过 |
| 6 | Discuss 页头加「编辑项目」按钮 | 首版用 replace，页头 Back 不返回 Discuss；改为 push 后测试通过 |
| 7 | 新增 3 条面板编辑测试 + 路由断言 + More 菜单链路断言 + docs 断言 | `panel-projects` 6/6、`navigation` 7/7、`docs` 14/14 |
| 8 | 更新 `docs/005`、`docs/007`，同步 `docs.spec.ts` 原断言 | 通过 |
| 9 | 建两个隔离 profile + fake `gh` + 种子 SQLite，截 Before/After | 首次启动 `EADDRINUSE`（`--port` 被 patch 覆盖）；改 patch 后两侧均起 |
| 10 | 截 8 张图（页头、新建页、编辑页、保存后页头、另一个项目） | 文案断言与截图一致：编辑页预填 `Widgets / acme/intake / acme/widgets / /srv/worktrees`；保存后 `acme/intake → acme/gadgets`；另一个项目仍 `acme/intake → acme/other` |
| 11 | 全量 `pnpm check` | 与另一 worktree 的 check 并发，`tests/followups.spec.ts` 超时 1 例；单独复跑 16/16 通过，随后独占重跑全量 |
