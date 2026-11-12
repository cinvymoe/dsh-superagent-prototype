# Requirement snapshot and frozen acceptance（C1）

- Alignment issue: `q-b91966d0`（Discuss 面板已确认并对齐派发，本切片为 C1）
- Source trigger: `ba7aba0b34edb4f6c780a735f2145dea`（`local:q-b91966d0`）

## 需求原文

> 需求列表 关联工单  每个链接新增一个session button  用于跳转到对应的 对话

## 验收标准（冻结版）

- 在需求列表打开任一有已启动会话工单的需求详情，关联工单区域每个此类工单都显示本地化的「打开 Session」按钮，点击后只打开该工单的 Executor Session（测试通过 server.opened 观察到正确的 session id）。
- 关联工单中没有启动过 Executor Session 的工单不渲染 Session 按钮。
- 工单标题链接仍进入该工单的 Execution 详情页，行为不变。
- 中文与英文界面均显示既有本地化标签「打开 Session / Open Session」，无需新增 locale 键。
- pnpm check（typecheck + test + build）通过，新增测试在 tests/panel-discuss.spec.tsx 中。
- docs/005-panel.md 的 Requirements 行说明关联工单可打开其 Executor Session。

## 范围

范围内：`src/client/discuss.tsx` 的关联工单区；`tests/panel-discuss.spec.tsx` 新增用例；`docs/005-panel.md` Requirements 行；本切片 issue/证据/PR 记录。

范围外：工单页与 Trigger 页等其他位置的 Session 按钮；新增 locale 键；服务端数据模型（`ticketSummary` 已暴露 `sessionId`，ThreadDetailView 已带出）。
