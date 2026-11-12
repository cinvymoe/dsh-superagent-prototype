# Requirement snapshot · P1

- Alignment issue: `q-539e143e`
- Slice: P1
- Source trigger: `fe1f9059888e5b6bf2520bc97079e47d`（`local:q-539e143e`）

## 需求原文

> 新建项目需要单独做一个按钮使用单独的一个界面。不要把它放在讨论下面。状态栏顶部使用分栏的 Tab 来展示每一个项目，展示不下，最后增加一个更多按钮。

## 冻结验收标准

- 面板顶部为每个本地项目显示一个项目 Tab（`role=tab`，当前项 `aria-selected`），页面 Tab 仍可用；项目 Tab 与页面 Tab 在视觉和语义上可区分。
- 选择项目 Tab 后，Discuss 的需求列表、页头和新建需求目标同步到该项目；切换项目不串数据。
- 项目多到放不下（例如窄视口或足够多的长项目名）时，Tab 行末尾出现「更多」按钮；打开后可选择未显示的项目，选中后该项目可用且当前项目可识别；所有项目始终可达，不出现只能横向滚动却无「更多」的状态。
- 顶部「新建项目」按钮不在 Discuss 页内；点击打开独立创建界面，取消/返回不创建；提交 `POST local/projects` 成功后新项目出现在项目 Tab 中并成为当前项目，Discuss 回到该项目的需求列表；名称、仓库、`worktreeRoot` 的校验与空值处理保持。
- Discuss 页不再包含项目列表、内嵌新建项目表单和「只看这个项目/查看全部项目」链接；当前项目的执行仓库与可选 `worktreeRoot` 在页面上可见。
- 无项目时顶部仍可进入新建项目，Discuss 显示先创建项目的提示；现有需求详情页仍显示所属项目。
- `pnpm check`（typecheck + vitest + build）通过；新增/更新测试覆盖 Tab 切换、溢出「更多」、独立创建和 Discuss 作用域；PR 附同一视口/主题下的 before/after 截图，baseline 为 `main`，after 为本分支。
- `docs/005-panel.md` 与 `docs/007-architecture.md` 已更新，描述项目栏、「更多」菜单和独立创建流程。

## 范围

范围内：`src/client/{projects,app,provider,discuss,route,locales,client.css}`、`tests/fixtures/panel-server.ts`、`tests/{panel-discuss,panel-projects}`、`docs/{005,007}`、切片记录与证据。

范围外：`src/app/**`、宿主 API/schema、`worktreeRoot` 语义、项目编辑/删除、其他面板页面布局。
