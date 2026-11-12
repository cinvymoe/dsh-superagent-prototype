# 需求快照 · C2 · 运行时应用 Agent 配置：工具限制与模型覆盖

- Alignment issue: `q-b03a9391`（Discuss 面板已确认；三片 C1→C2→C3，`dependsOn: [C1]`）
- 本切片：`C2`，ticket `9464d98fa7afacf61979a6554f28557b`
- 来源触发：`d8adb9c28f7dd5c6b3f8a999c1cdefd4`（`local:q-b03a9391`）

## 用户原话

> superagent 当前有几个执行的 Agent？需要在设置界面新增一个 Agent 的配置 页面 支持自定义当前 Agent 的工具和一些相关配置。

## 对齐结果（Discuss 面板冻结）

- 可配置角色三类：主 Session（main）、对齐 Agent（aligner，`mode: 'align'` 的工单）、执行器（executor，其余工单；子代理继承执行器工具，不单独配置）。
- C1 完成 `agents` 设置块（`model`、`disabledTools`）、工具目录与保存/校验 API，默认不改变运行中 Session。
- C2（本切片）把配置应用到运行期：可选工具在新建与已运行 Session 上的生效规则、必需工具与自动工具（压缩工具、计划切片的 `feature_exec_*`）的保留，以及按角色解析模型覆盖（仅新 Session）。
- C3（后续）面板「智能体」页。

## 冻结验收标准

1. 关闭执行器可选工具（如 `web_search`）后：新建执行器 Session 看不到它；保存后已在运行的执行器及其子代理在下一步失去它；必需工具仍在。
2. 主 Session 关闭 `read_image` 后下一步生效；存在压缩工具时仍自动保留。
3. 计划切片工单仍自动获得 `feature_exec_*`；对齐 Agent 使用对齐自己的可选集。
4. 模型覆盖按定义生效：主 Session←`agents.main` ?? 评估模型；执行器←`agents.executor` ?? 执行模型；对齐←`agents.aligner` ?? 执行器有效模型。只对新 Session 生效，已运行 Session 保持原模型。
5. 没有 `agents` 配置时，三类 Session 的工具与模型与现在完全一致（回归对照）。
6. `pnpm vitest run tests/agent-config.spec.ts tests/runtime.spec.ts tests/role-models.spec.ts` 与 `pnpm typecheck` 通过；PR 前 `pnpm check` 全绿；`docs/003`、`docs/007` 已更新。

## 范围外

`agents` 数据模型 / HTTP 路由（C1）、面板页面（C3）、新增角色原本没有的工具、子代理单独配置、搬动 `eval.model` / `executor.model` 字段。
