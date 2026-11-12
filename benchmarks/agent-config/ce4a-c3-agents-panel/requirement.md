# 需求快照 · C3 面板「智能体」设置页

- Alignment issue: `q-b03a9391`（Discuss 面板已确认，`decidedAt 2026-11-12T16:19:33.242Z`；三片 C1→C2→C3）
- 本切片：`C3`，ticket `ce4a60f73cc5f35ed716407967979f02`
- 来源触发：`d8adb9c28f7dd5c6b3f8a999c1cdefd4`（`local:q-b03a9391`）

## 用户原话

> superagent 当前有几个执行的 Agent？需要在设置界面新增一个 Agent 的配置 页面 支持自定义当前 Agent 的工具和一些相关配置。

## 对齐结果（Discuss 面板冻结）

- 可配置角色三类：主 Session（main）、对齐 Agent（aligner）、执行器（executor；子代理继承执行器工具，不单独配置）。
- C1 已交付 `agents` 设置块（`model`、`disabledTools`）、工具目录（`AGENT_TOOLS`）与保存/校验 API；C2 已让保存结果在运行期生效（工具限制下一步刷新，模型覆盖只进新 Session）。
- C3（本切片）只做面板：设置导航与「智能体」页、双语文案、面板路由、fixture/面板测试与文档；不改设置块语义与运行期行为。

## 冻结验收标准

1. 设置导航出现「智能体」（执行之后、提示词之前），路由刷新/返回保持；页面列出主 Session、对齐 Agent、执行器，并说明子代理继承执行器工具。
2. 执行器卡片显示当前 `running / maxWorkers`，链接可跳到「执行」组，不在此处修改并发。
3. 每类角色的模型留空时显示继承的实际值（主 ← 评估模型；对齐/执行器 ← 执行模型；对齐默认继承执行器覆盖），可设置覆盖并一键恢复继承。
4. 工具列表：必需工具固定勾选且不可改；可选工具可开关；保存 PUT `settings/agents` 的 `disabledTools` 正确；冲突保留草稿并显示冲突提示。
5. 保存栏仅在改动时出现；历史能读到 agents 保存并显示角色/模型/工具变化；zh/en 齐全。
6. 定向测试与 `pnpm typecheck` 通过；PR 前 `pnpm check` 全绿；PR 含 Before/After 截图。

## 范围外

`agents` 数据模型 / HTTP 路由（C1）、运行期工具与模型应用（C2）、搬动 Eval/Execution 现有 `model` 字段、`maxWorkers` 的语义与位置、新增角色原本没有的工具、子代理单独配置。
