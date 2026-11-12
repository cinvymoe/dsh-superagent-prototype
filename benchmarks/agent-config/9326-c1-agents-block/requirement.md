# 需求快照 · C1（冻结版）

原始需求（local issue `q-b03a9391`，2026-11-12）：

> superagent 当前有几个执行的 Agent？需要在设置界面新增一个 Agent 的配置 页面 支持自定义当前 Agent 的工具和一些相关配置。

Discuss 面板确认的三类可配置角色：主 Session、对齐 Agent、执行器（子代理继承执行器工具，不单独配置）。
本切片只做**配置数据模型、校验与管理 API**，默认无配置时行为与现在完全一致。

## 验收标准（冻结版，逐字）

1. `SettingsSchema.parse({})` 得到空的 `agents` 三角色配置；旧设置（无 `agents`）照常解析，行为不变。
2. `GET settings` 返回 `blocks.agents` 的 value/revision，以及三角色工具目录（required/optional、预设名）。
3. `PUT settings/agents` 合法值保存成功、块 revision 递增并写入历史；关闭必需工具返回 400 与 `agentsRequiredTool`，未知工具返回 400 与 `agentsUnknownTool`，非 panel 来源返回 `panelOnlyAgents`，不可用模型返回 `modelUnavailable`。
4. 历史 diff 能显示每个角色的模型与工具变更（新增 `SettingsChangeCode`）。
5. 存储里出现目录中已不存在的工具名时仍能读取（运行期忽略），不会因升级失败。
6. `pnpm vitest run tests/agent-config.spec.ts tests/policy.spec.ts tests/settings.spec.ts tests/http.spec.ts tests/locales.spec.ts tests/docs.spec.ts` 与 `pnpm typecheck` 通过；PR 前 `pnpm check` 全绿。

## 范围外

运行期工具限制与模型注入（C2）、面板「智能体」页（C3）、搬动 `eval.model`/`executor.model`、新增角色原本没有的工具。
