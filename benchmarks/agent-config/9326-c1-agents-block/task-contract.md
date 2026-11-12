# task-contract · C1 · `agents` 设置块（数据模型、校验、管理 API）

## 目标（单一、可验收）

让 `agents` 成为与 `policy` / `eval` / `executor` 并列的设置块：三角色（`main` 主 Session、`aligner` 对齐 Agent、`executor` 执行器）各可覆盖 `model` 并可关闭**可选**工具；提供三角色工具目录、保存校验、历史 diff、`GET settings` / `PUT settings/agents`；**不改变任何运行中 Session 的行为**（运行期应用归 C2，面板页归 C3）。

North star: `SettingsSchema.parse({})` → `agents` 三角色全空；旧设置照常解析；合法 PUT 成功并进历史；四类拒绝（`agentsRequiredTool` / `agentsUnknownTool` / `panelOnlyAgents` / `modelUnavailable`）；历史 diff 可显示每角色模型与工具变更；目录外的存量工具名照样能读。

## 必读

- 切片 issue：`docs/issues/9326a1747b59254c13ccd91f49aa4028.md`（冻结验收标准 6 条）
- 现有代码：`src/policy.ts`（SettingsSchema/BLOCKS 惯例）、`src/app/settings.ts`、`src/app/views/settings.ts`、`src/app/settings-history.ts`、`src/app/sessions.ts`、`src/app/execution-strategy.ts`、`src/app/http.ts`、`src/core/errors.ts`、`src/client/locales.ts`、`src/limits.ts`
- 测试惯例：`tests/settings.spec.ts`（真 Runtime + `startRuntime`）、`tests/http.spec.ts`（假 runtime 直接验路由/错误映射）、`tests/policy.spec.ts`、`tests/locales.spec.ts`、`tests/docs.spec.ts`
- 仓库事实：`docs/007-architecture.md` 的 Modules/Tests 表由 `tests/docs.spec.ts` 强制（新增 `src` 文件与测试文件必须入表）；`tests/class-docs.spec.ts` 要求每个 class 前有 JSDoc。

## 数据模型（固定，不要改名）

`src/policy.ts`：

```ts
/** The three Agent roles a person configures; an Executor Session's subagents inherit its tools. */
export const AGENT_ROLES = ['main', 'aligner', 'executor'] as const
export type AgentRole = typeof AGENT_ROLES[number]
/** One role's overrides: its model when set (null inherits the role's default model), and the optional tools it turns off. */
export const AgentRoleConfigSchema = z.object({
  model: RoleModelSchema.nullable().default(null),
  disabledTools: z.array(z.string().trim().min(1).max(LIMITS.toolName)).default([]),
}).strict()
export const AgentsConfigSchema = z.object({
  main: AgentRoleConfigSchema.default(() => AgentRoleConfigSchema.parse({})),
  aligner: AgentRoleConfigSchema.default(() => AgentRoleConfigSchema.parse({})),
  executor: AgentRoleConfigSchema.default(() => AgentRoleConfigSchema.parse({})),
}).strict()
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>
```

- `SettingsSchema` 增加 `agents: AgentsConfigSchema.default(() => AgentsConfigSchema.parse({}))`（放在 `executor` 之后）。
- `SettingsBlock` 增加 `'agents'`（`SettingsSave` 由它推导，自动包含）。
- **读取必须宽松**：`disabledTools` 只做有界字符串校验，绝不校验目录成员；存量里出现目录已不存在的工具名时 `SettingsSchema.parse`、`Settings.parse`、`store.settings()` 全部照常返回。
- `src/limits.ts` 增加 `toolName: 80`（与其他 bounds 同处）。

## 工具目录（`src/app/agent-tools.ts`，新文件）

把 `src/app/sessions.ts` 里的 `MAIN_TOOLS`、`COMPRESSION_TOOLS`、`WORK_TOOLS` 与 `ROUTER_PRESET`、`WORKER_PRESET` **原样搬入** `src/app/agent-tools.ts`（连同它们现有的 JSDoc 说明），`sessions.ts` 改为从新模块 import；`tests/bundle-patch.spec.ts` 的 preset import 改到 `../src/app/agent-tools.ts`。`execution-strategy.ts` 的 `FEATURE_EXEC_TOOLS` 不进入可配置目录（C2 保持切片工单自动获得；压缩工具也保持自动保留）。

目录（`required` = 不可关闭，`optional` = 可关闭）：

- `main`：`preset: ROUTER_PRESET`；`required` = `MAIN_TOOLS` 去掉 `read_image`；`optional` = `['read_image']`。
- `aligner` / `executor`：`preset: WORKER_PRESET`；`required` = `['read','write','edit','glob','grep','bash','job_output','job_list','job_kill']`；`optional` = `WORK_TOOLS` 中不在 required 的其余项（`read_image`、`pwsh`、`web_search`、`web_fetch`、`skill`、`todo_write`、`subagent`、`list_subagent_models`、`send_message`、`list_agents`、`interrupt_agent`）。

导出：

```ts
export interface AgentTools { preset: string; required: readonly string[]; optional: readonly string[] }
export const AGENT_TOOLS: Readonly<Record<AgentRole, AgentTools>>
/** The catalog `GET settings` offers, in role order. */
export function agentCatalog(): { role: AgentRole; preset: string; required: string[]; optional: string[] }[]
/** Refuse a save that turns off a required tool or names a tool the role does not have. */
export function validateAgentTools(agents: AgentsConfig): void
```

`validateAgentTools` 语义（顺序固定）：先未知、后必需；每个角色独立判断：

- `disabledTools` 里有不在 `required ∪ optional` 的名字 → `throw new UserError('agentsUnknownTool', { role, tools: 名字以 ', ' 连接 })`
- 有在 `required` 里的名字 → `throw new UserError('agentsRequiredTool', { role, tools: 以 ', ' 连接 })`

（`required ∪ optional` 必须互斥；`optional` 非空，`main` 的 `optional` 恰为 `['read_image']`，执行器含 `web_search`。）

## 错误码与文案

`src/core/errors.ts` 的 `USER_ERRORS` 增加（`refused`）：

- `agentsRequiredTool: ['refused', 'The {role} Agent cannot turn off its required tools: {tools}']`
- `agentsUnknownTool: ['refused', 'The {role} Agent has no tool named {tools}']`
- `panelOnlyAgents: ['refused', 'Agent models and tools can only be changed in the management panel']`

`src/client/locales.ts`（`TEXT` 的 `[zh, en]` 元组，占位符必须中英一致）：

- `'userError.agentsRequiredTool': ['{role} 的必需工具不能关闭：{tools}', USER_ERRORS.agentsRequiredTool[1]]`
- `'userError.agentsUnknownTool': ['{role} 没有这些工具：{tools}', USER_ERRORS.agentsUnknownTool[1]]`
- `'userError.panelOnlyAgents': ['智能体的模型与工具只能在管理页修改。', USER_ERRORS.panelOnlyAgents[1]]`

`SettingsChangeCode` 增加 6 个码，并在 `TEXT` 里配文案（`change.<code>`，都用既有占位符集合，`from`/`to` 已是字符串）：

- `agentMainModel` / `agentAlignerModel` / `agentExecutorModel`：如 `['智能体模型（主 Session、对齐 Agent、执行器）', 'Agent model (…)']`，无占位符
- `agentMainTools` / `agentAlignerTools` / `agentExecutorTools`：`['智能体停用的工具（主 Session）：{from} → {to}', 'Agent tools turned off (main Session): {from} → {to}']`，中英占位符一致

## 保存（`src/app/settings.ts`）

- `BLOCKS` 增加 `agents`：
  - `parse`: `const agents = AgentsConfigSchema.parse(value); validateAgentTools(agents); return agents`
  - `merge`: `{ ...settings, agents: value as SettingsValue['agents'] }`
  - `guard`: `if (origin !== 'panel' && JSON.stringify(current.agents) !== JSON.stringify(candidate.agents)) throw new UserError('panelOnlyAgents')`
- 模型校验：把现有 eval/executor 的单模型检查改成列表遍历（保持现有 `block` 值与报错文本不变）：`eval` → `candidate.eval.model`；`executor` → `candidate.executor.model`；`agents` → 逐角色，仅当 `JSON.stringify(model) !== JSON.stringify(previous)` 且非 null 时 `resolveRoleModel`，失败抛 `new UserError('modelUnavailable', { block: 'agents.<role>', error })`。
- `view()` 增加 `agents: { revision: revision('agents'), value: settings.agents }`。
- `block()` 接受 `'agents'`（返回 `{ block, revision, value: settings.agents }`）。

## 读取 API

- `src/app/views/settings.ts`：`blocks.agents = { value: settings.agents, revision: store.blockRevision('agents') }`，并新增顶层 `agents: { roles: agentCatalog() }`（三项，含 `role`/`preset`/`required`/`optional`）。
- `src/app/http.ts`：`SettingsBlockSchema` 的 enum 增加 `'agents'`。
- `src/app/tools/main.ts`：`orchestrator_settings_save` 的 `block` enum 增加 `'agents'`（保存仍被 guard 拒绝，`panelOnlyAgents`），描述无需改。
- `src/app/resources.ts`：`settings/<block>` 的列举加上 `agents`（`policy, eval, executor, agents, pause or source:<id>`），其余不动。
- `src/app/api.ts`：类型自视图推导，通常无需改动；确认 `AppSettings`/`SettingsView` 派生类型不报错。

## 历史 diff（`src/app/settings-history.ts`）

- 新增 6 个 `SettingsChangeCode` 与角色映射（`main`/`aligner`/`executor` → 对应码）。
- `settingsChanges` 中对每个角色：模型用 `same()` 比较，变了推 `{ code: <model 码> }`；`disabledTools` 变了推 `{ code: <tools 码>, from: before.join(' '), to: after.join(' ') }`。
- **旧快照兼容**：存储里的历史版本可能没有 `agents` 字段（本特性之前的记录）；比较时用 `(settings.agents as AgentsConfig | undefined) ?? AgentsConfigSchema.parse({})`，绝不让 `changesOf` 因 `undefined` 抛错（那会把 diff 变成 `null`）。
- 保存 `agents` 不改变 `policyVersion`（模型/工具不影响授权），`policy_changed` 应为 `false`。

## 测试（必须新增/扩展，且全部可运行）

1. **`tests/agent-config.spec.ts`（新）** 用 `tests/fixtures/host.ts` 的 `startRuntime`：
   - `agentCatalog()` / 目录不变式：三角色顺序 `main, aligner, executor`；preset 分别为 `dsh-superagent-router` / `dsh-superagent-worker` / `dsh-superagent-worker`；required/optional 不相交；`main.optional` = `['read_image']`；`executor.optional` 含 `web_search`；`executor.required` 含 `bash`、`job_output`；压缩工具与 `feature_exec_*` 不在任何目录里。
   - `GET settings`：`blocks.agents` 的 `value`（三角色空值）与 `revision`，以及 `agents.roles` 三项的 `required`/`optional`/`preset`。
   - `PUT settings/agents` 合法值（例如 `executor.disabledTools = ['web_search']`、`main.model = { provider: 'p', model: 'm' }`，用 host 的 `llm.resolveCallConfig` 默认放行）：200、`revision` 递增、`GET settings` 读到新值；随后 `GET policy/history` 的 `items[0]` 含 `block: 'agents'`，changes 含 `{ code: 'agentMainModel' }` 与 `{ code: 'agentExecutorTools', from: '', to: 'web_search' }`。
   - 拒绝：关闭必需工具 → 400 `{ code: 'agentsRequiredTool', values: { role: 'executor' } }`；未知工具 → 400 `agentsUnknownTool`；非 panel 来源（`h.runtime.settings.save('agents', …, 'tool')`）→ `UserError('panelOnlyAgents')`；不可用模型（`llm.resolveCallConfig.mockRejectedValueOnce` 或按 settings.spec 的 mock 手法）→ 400 `modelUnavailable`。
   - 升级容忍：`seed` 写入一个 `agents.executor.disabledTools = ['retired_tool']` 的旧值，Runtime 正常启动、`GET settings` 原样读出该名字。
2. **`tests/policy.spec.ts`**：`SettingsSchema.parse({})` 的 `agents` 三角色空值；无 `agents` 的旧设置解析出同样默认值（`migrateSettings` 后亦可）。
3. **`tests/settings.spec.ts`**：`settings.save('agents', …, 'tool')` 在值变化时抛 `panelOnlyAgents`；`panel` 保存成功且 `blockRevision('agents')` 递增；相同值的保存不新增 revision。
4. **`tests/http.spec.ts`**：`PUT settings/agents` 到达 `settings.save`（`panel` 来源、block 名 `agents`）；假 runtime 抛 `UserError('agentsRequiredTool')` 时映射为 400 且带 `code`/`values`。
5. **`tests/locales.spec.ts`**：新增 6 个 `change.<code>` 键中英齐全（用显式码表断言）。
6. **`tests/docs.spec.ts`** 保持全绿：`docs/007-architecture.md` 的 Modules 表加 `src/app/agent-tools.ts`、Tests 表加 `tests/agent-config.spec.ts`。

## 文档

- `docs/007-architecture.md`：
  - Modules 表加 `src/app/agent-tools.ts` 行；`src/app/views/settings.ts` 行补 "the Agents catalog"；`src/app/settings.ts` / `settings-history.ts` 行按需补 agents 说明。
  - Settings 一节补一段：`agents` 块三角色、只有 `panel` 能保存、必需工具不可关闭、目录外的存量工具名在运行期忽略、保存不改运行中 Session 的行为（C2 应用）、保存不改 `policyVersion`。
  - "Settings saves select …" 一行加 `agents`。
  - Tests 表加 `tests/agent-config.spec.ts` 行。
- `docs/006-deployment.md`：`GET settings` 行补 `agents`（块与目录）；`PUT settings/<block>` 说明；The blocks 列表补 `agents` 一条（三角色 `{ model, disabledTools }`、`required` 不可关闭、只有 panel 来源、`model` 留空继承）。

## 边界（不要做）

- 不要改 `Sessions`/`DshExecutor`/`role-models` 的任何运行期行为（C2）。
- 不要改面板页面、路由、`src/client/*.tsx`（C3）。
- 不要搬动/删除 `eval.model`、`executor.model`。
- 不要让主 Session 的工具真正写入 agents 配置；它必须被 `panelOnlyAgents` 拒绝。
- 不要引入新依赖；不要改 `package.json`。

## 验证与证据

```sh
pnpm vitest run tests/agent-config.spec.ts tests/policy.spec.ts tests/settings.spec.ts tests/http.spec.ts tests/locales.spec.ts tests/docs.spec.ts
pnpm typecheck
pnpm check
```

把三条命令的实际输出尾部写入 `docs/issues/evidence/C1-agents-tests.txt`（时间、命令、退出码、通过用例数）。`pnpm check` 必须全绿（typecheck + 全量 vitest + build）。

## 交付与报告

- 在 ticket worktree 直接改文件（不要 `git commit`/`git push`/开 PR，由 ticket worker 提交）。
- 报告格式：改动文件清单；每条冻结验收标准的对照（如何验证）；三条命令的退出码与关键输出；任何偏离本契约之处先说明理由；遗留风险。
