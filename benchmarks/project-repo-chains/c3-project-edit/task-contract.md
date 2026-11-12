# task-contract · T1 · C3 面板项目编辑与双项目隔离

## 背景

- 对齐 issue：`q-141a6a1e`，slice `C3`；冻结验收标准见 `docs/issues/7da08cb013a15d3c5238a983664829d0.md`。
- 工作区：`/data/project/workspace/dsh-worktrees/slice-7da08cb013a1`。
- 基线：本切片开始时的 deployment `main` head = `afab266e`（含 C1 / PR #11）。
- 依赖：C2（PR #13，head `df875f01`）已提供项目链路 API（`POST/PUT local/projects`）、四字段创建页、Discuss 页头/项目菜单的 `intake → code` 展示、服务端「只改本项目链路」的原子性。本任务在 C2 分支之上继续，不重做这些。

## 唯一目标

让同一个独立项目表单既创建也编辑当前项目：Discuss 页头提供编辑入口，编辑页预填当前项目四个字段，保存走 `PUT local/projects/:id` 后刷新并返回；编辑一个项目不得改变另一个项目的两条仓库展示与链路。补充「编辑一个项目不影响另一个项目」的面板测试与文档。

## 设计（按此实现，不要另立方案）

1. **路由**（`src/client/route.ts`、`src/client/app.tsx`）：Discuss 路由增加编辑态 `{ page: 'discuss', edit: <projectId> }`，与 issue 详情 `id`、新建 `create` 互斥；`parseRoute` 归一化（edit 优先于 create）；`routeLabel` 对编辑页返回 `discuss.editProject`。`Pages` 在编辑态渲染项目表单。
2. **共用表单**（`src/client/projects.tsx`）：`NewProjectPage` 重构为 `ProjectFormPage({ edit?: string })`。创建与编辑共用四个字段和校验提示；编辑态从 `usePanelData().projects` 取当前项目并预填（`intakeRepository ?? codeRepository ?? repository`、`codeRepository ?? repository`），只预填一次，后续列表轮询不得覆盖用户输入。创建 `POST local/projects`（空根目录省略 key）；编辑 `PUT local/projects/:id`（始终带 `worktreeRoot`，空字符串即清除）。成功后 `reloadProjects()`、`setProject(id)`、`navigate({page:'discuss'}, true)`；失败 `notify(errorText(failure))` 留在本页且保留输入。
3. **编辑入口**（`src/client/discuss.tsx`）：Discuss 页头 actions 为当前项目提供「编辑项目」按钮；页头继续显示两条仓库与可选 worktree root。
4. **测试**（`tests/panel-projects.spec.tsx`、`tests/navigation.spec.ts`、`tests/docs.spec.ts`）：新增两个项目下编辑一个项目的面板测试（PUT 路径/body 只含本项目、保存后页头更新、另一个项目页头与服务器记录不变、再编辑另一个项目只影响它）；400（相对 worktreeRoot）显示既有文案并停留、清除根目录发送空字符串、Cancel/Back 不发请求；More 菜单行显示两条仓库；parseRoute 的 edit/create 断言；docs.spec 锁定编辑页文案。
5. **文档**（`docs/005-panel.md`、`docs/007-architecture.md`）：写清同一表单承担创建与编辑、编辑只提交当前项目并刷新返回、取消/返回不写入、拒绝保存保留页面与输入；更新模块/测试表行。

## 不在本次

C2 的服务端链路协调与运行时执行路径、项目删除、其他 Source。

## 验证

- 定向：`npx vitest run tests/panel-projects.spec.tsx tests/panel-discuss.spec.tsx tests/navigation.spec.ts tests/docs.spec.ts`
- 全量：`env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check`
- 视觉：同一视口 1440×1100、浅色、zh-CN；Before = `afab266e` 真实面板，After = 本分支 head。
