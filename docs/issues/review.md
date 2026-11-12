# 双轴评审 · C1 · `agents` 设置块（数据模型、校验与管理 API）

- 评审对象：`agent/agent-api-9326a1747b59` 工作区相对 `main @ 934a1f07` 的全部改动（含本切片新增文件）
- 评审时间：2026-11-13
- 评审人：ticket worker（自评审，A1）；机器门禁：`tests/*` + `pnpm typecheck` + `pnpm check`
- 结论：**通过**（无阻塞项；2 条非阻塞观察已记录）

## 轴一 · Standards（代码标准 / 结构）

逐项对照仓库既有惯例，无阻塞发现：

| 检查项 | 结论 |
| --- | --- |
| 设置块模式 | `BLOCKS` 的 `parse` / `merge` / `guard` 三件套与 `eval`/`executor` 完全同构；`SettingsBlock`/`SettingsSave` 是唯一块名来源，`KV.settings.block` 无需改动 |
| 读取宽松 / 保存严格的分层 | `SettingsSchema`（读）只做有界字符串校验，`BLOCKS.agents.parse`（写）才调 `validateAgentTools`；升级容忍由 `tests/agent-config.spec.ts` 的 seed 用例端到端证明 |
| 单一事实来源 | `MAIN_TOOLS` / `WORK_TOOLS` / `COMPRESSION_TOOLS` / `ROUTER_PRESET` / `WORKER_PRESET` 从 `sessions.ts` 原样搬入 `agent-tools.ts`（JSDoc 一并迁移），`sessions.ts` 与新模块单向依赖，无循环 import；`tests/bundle-patch.spec.ts` 同步改 import |
| 错误码纪律 | 3 个新码进 `USER_ERRORS`（`refused`），`locales.ts` 中英成对且占位符一致（`locales.spec` 的既有全量检查覆盖）；HTTP 由 `failure()` 统一映射 400 + `code`/`values` |
| 历史 diff | 新码集中在 `SettingsChangeCode`；旧快照缺 `agents` 用 `AgentsConfigSchema.parse({})` 兜底，不让 `changesOf` 退化成 `null`；diff 只在真正变化时产出条目 |
| origin guard | 与 `panelOnlyEnvironment` / `panelOnlyAccounts` 同型；主 Session 工具 enum 增加 `agents` 后仍被 guard 拒绝（`tests/tools.spec.ts` 断言），符合“工具不能给 Agent 扩权” |
| 测试质量 | 新增 `tests/agent-config.spec.ts` 5 例（目录不变式、GET 视图、保存+revision+历史、四类拒绝、升级容忍）；`policy`/`settings`/`http`/`locales`/`tools` 各自补有针对性的断言，无重复大包围 |
| 文档门禁 | `docs/007` Modules/Tests 表新增行（`docs.spec` 强制），`Settings` 段落与 “Settings saves select …” 同步；`docs/006` 的 `GET settings` 行与 blocks 列表补 `agents`；文档只陈述本切片实际行为（不宣称运行期已生效） |
| 边界 | 未改 `Sessions`/`DshExecutor`/`role-models` 行为，未动 `src/client/*.tsx`，未搬 `eval.model`/`executor.model`，无新依赖 |
| 命名/风格 | 与仓库一致：`type` 导入分离、JSDoc 单行块、无分号；`tsc --noEmit` 通过 |

非阻塞观察（记录，不在本切片改动）：

1. `disabledTools` 允许重复项（存储/保存都不去重）。面板不会产生重复；运行期按集合判断，重复无行为影响。若 C2 需要规范化可在解析处加去重。
2. `agents` 块内 `model` 与 `eval.model`/`executor.model` 暂时并存（继承默认值语义由 C2 定义）；本切片未搬动旧字段，符合冻结范围。

## 轴二 · Spec（冻结验收标准逐条对照）

| # | 验收标准 | 证据 | 结论 |
| --- | --- | --- | --- |
| 1 | `SettingsSchema.parse({})` 得到空的 `agents` 三角色配置；旧设置（无 `agents`）照常解析，行为不变 | `tests/policy.spec.ts` › agent settings；`SettingsSchema.parse({})`、缺块旧设置、`migrateSettings` 旧形态三路等值；`tests/agent-config.spec.ts` GET 视图 revision 0 | 通过 |
| 2 | `GET settings` 返回 `blocks.agents` 的 value/revision，以及三角色工具目录（required/optional、预设名） | `tests/agent-config.spec.ts` › returns the agents block…；三项顺序 `main,aligner,executor`，preset `dsh-superagent-router` / `dsh-superagent-worker`，required/optional 与实际目录一致 | 通过 |
| 3 | `PUT settings/agents` 合法值保存成功、块 revision 递增并写入历史；四类拒绝可达 | `tests/agent-config.spec.ts` › saves a valid agents value…（200、revision 0→1、history block=agents）；› refuses…（400 `agentsRequiredTool`/`agentsUnknownTool`/`modelUnavailable`，`settings.save(..., 'tool')` → `panelOnlyAgents`）；`tests/http.spec.ts` 路由层错误映射；`tests/settings.spec.ts` origin/no-op | 通过 |
| 4 | 历史 diff 能显示每个角色的模型与工具变更（新增 `SettingsChangeCode`） | 新增 6 码 `agent{Main,Aligner,Executor}{Model,Tools}`；`tests/agent-config.spec.ts` 断言 `{code:'agentMainModel'}` 与 `{code:'agentExecutorTools', from:'', to:'web_search'}`；`tests/locales.spec.ts` 断言中英文案齐全 | 通过 |
| 5 | 存储里出现目录中已不存在的工具名时仍能读取（运行期忽略），不会因升级失败 | `tests/agent-config.spec.ts` › still reads an agents block…（seed 写入 `retired_tool`，Runtime 正常启动并原样返回）；`tests/policy.spec.ts` 解析层同断言 | 通过 |
| 6 | 指定 6 个测试文件与 `pnpm typecheck` 通过；PR 前 `pnpm check` 全绿 | 见 `docs/issues/evidence/C1-agents-tests.txt`：6 文件 368 例通过；`tsc --noEmit` 退出 0；clean env 下 `pnpm check` 退出 0（typecheck + 1328+ 例 + build） | 通过 |

## 架构影响（e3 判定）

`arch_impact: local`。理由：新增一个设置块与一个只含常量/校验的模块；`Settings`、`SettingsView`、`SettingsChangeCode` 的既有契约向后兼容（读取缺块默认空配置），无公共 API 破坏、无数据库 schema 变更（KV 块 revision 家族本就按 `SettingsSave` 泛化）、无跨模块职责重划。运行期工具允许集的计算仍留在 `Sessions`，由 C2 接入。

## 遗留与交接

- C2：`Sessions` 用 `AGENT_TOOLS` + `settings.agents` 计算每角色允许集、保存后刷新运行中 Session；`role-models` 按角色解析覆盖模型。
- C3：面板「智能体」页消费 `blocks.agents` 与 `agents.roles`；历史渲染直接读新 change 码即可。
- 无 UI 改动，不需要 Before/After 截图（C3 交付时补）。
