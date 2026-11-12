# C2 双轴评审与测试证据 · 需求侧执行模式存储、修改接口与派发传递

- Run: `run-mwdn6uki-4`（execute，policy A1），issue `q-2f92c878:C2`
- Ticket: `5e9fa76642ab9972e1b7b557716ae657`
- 分支：`agent/slice-5e9fa76642ab`，起点 deployment `main` @ `c68e6e44`，已 merge C1 分支 `agent/ticket-a6e2430d5e8f`
  （合并提交 `86a9f3ee`；C1 PR #18 仍需先合）
- 评审日期：2026-11-12

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/sources/local-format.ts` | `LocalIssue.execution?: ExecutionMode`（缺字段 = native，旧记录合法）；`requirementExecutionMode()` 归一化 |
| `src/app/local.ts` | `executionStrategy()` 生成 `{ mode, version: EXECUTION_STRATEGY_REVISION }`；`setExecution()` 校验模式、拒绝已派发需求、写记录；`planInput()` 带出 `execution` |
| `src/app/runtime.ts` | `dispatchPlan()` 把 `execution` 传给 `Engine.acceptPlan` |
| `src/app/http.ts` | 新增 `POST local/issues/:id/execution`，未知需求 404，域错误走 `failure()` 的 400 + code |
| `src/app/api.ts` | `Api` 增加该路由的类型契约（C4 面板消费） |
| `src/core/errors.ts`、`src/client/locales.ts` | 新增 `executionMode`、`executionLocked` 两个错误码与中英文文案 |
| `tests/local.spec.ts` | 默认 native、显式设置、非法模式不改记录、已派发拒绝且记录不变 |
| `tests/local-align.spec.ts` | HTTP 默认/设置/非法/404、确认后 `plan.execution` 固定、派发后拒绝且记录不变、无字段需求按 native 派发 |
| `tests/fixtures/panel-server.ts` | 镜像新路由与派发后的只读拒绝（C4 用例的 fixture 基础） |
| `docs/issues/evidence/c2-execution-mode-*.log` | 红、定向、类型、回归、全量证据 |

## Standards 轴

结论：**通过（approve）**。

- **单一写入者**：执行模式只经 `LocalIssues.setExecution` 写入；HTTP 路由只做 schema 与 404，不重复域校验，也不直接写 KV。
- **数据形状**：复用 C1 的 `ExecutionMode` / `ExecutionStrategy` / `EXECUTION_STRATEGY_REVISION`，没有重复定义；`LocalIssue` 只新增可选字段，旧记录无需迁移即可读取。
- **错误语义**：两种拒绝都是 `UserError` 固定错误码（`executionMode` / `executionLocked`），HTTP 返回 400 + `code`，面板可按 code 本地化；拒绝路径先于任何写入，记录不被触碰。
- **派发职责**：本 slice 不重写 `plan.execution`——`Engine.acceptPlan` 在创建时固定，重复确认复用 Ticket 并保留已固定策略（C1 行为，`tests/core-engine.spec.ts` 覆盖）。
- **测试质量**：断言 HTTP 状态码、错误码、记录内容与 Ticket 的 `plan.execution`，不绑定实现细节；复用既有 harness，不改既有断言。
- **差异卫生**：`git diff --check` 无输出；无无关重构、无新依赖。

## Spec 轴（逐条对照冻结验收标准）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 新建需求未指定时为 native；调用新接口改为 feature-exec 后，读取需求返回 feature-exec | PASS | `src/sources/local-format.ts:requirementExecutionMode`（缺字段 → native）；`src/app/local.ts:setExecution`；`tests/local.spec.ts`「defaults a requirement to native…」；`tests/local-align.spec.ts`「records a requirement's execution mode…」断言 POST 200 后 `GET local/issues/:id` 返回 `feature-exec`，未设置时为 `native` |
| 2 | 需求已有派发 Ticket 后调用新接口被拒绝，需求记录保持不变 | PASS | `setExecution` 先查 `tickets.list()` 中 `plan.issueId === id`，有则 `throw UserError('executionLocked')` 且不写 KV；`tests/local-align.spec.ts` 在确认派发后 POST `native` → 400 `executionLocked`，随后 GET 仍为 `feature-exec`；单元用例同断言 |
| 3 | 确认对齐后生成的每个 Ticket 的 `plan.execution` 与需求当前模式一致；存量无字段需求按 native 派发 | PASS | `planInput` 返回 `{ mode: requirementExecutionMode(issue), version: EXECUTION_STRATEGY_REVISION }`，`Runtime.dispatchPlan` 传给 `Engine.acceptPlan`，C1 在创建时固定；`tests/local-align.spec.ts`「…refuses changes after dispatch」断言 Ticket `plan.execution = { mode:'feature-exec', version:'execution-v1' }`，「dispatches a requirement without an execution field as native」断言无字段需求固定 `native` |
| 4 | `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts` 与 `pnpm typecheck` 通过 | PASS | 定向 2 files / 37 tests passed；`tsc --noEmit` exit 0；见下方测试证据 |

## 测试证据

- 红（改动前源码 + 新用例）：2 files failed，4 failed / 33 passed，`issues.setExecution is not a function`（`docs/issues/evidence/c2-execution-mode-red.log`）。
- 绿（定向）：`pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts` → 2 files / 37 tests passed（`c2-execution-mode-targeted.log`）。
- 类型：`pnpm typecheck` → exit 0（`c2-execution-mode-typecheck.log`）。
- 相关回归：`pnpm vitest run tests/locales.spec.ts tests/core-engine.spec.ts tests/docs.spec.ts` → 3 files / 139 tests passed（`c2-execution-mode-regression.log`）。
- 全量：`env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm check` → 63 files / 1292 tests passed，Build complete，exit 0（`c2-execution-mode-check.log`）。
- `git diff --check`：无输出。

## 架构影响

- `arch_impact: local`。只在已有的本地需求链路（记录 → 管理路由 → acceptPlan）上加一个可选字段、一个路由和两个错误码；没有公共类型破坏（`LocalIssue.execution`、`Api` 条目均为新增），没有 schema/数据库变更，没有跨模块职责重划。
- 新路由是 C4 面板的输入契约；`docs/003`/`005`/`007` 的产品文档归 C5，本 slice 不触碰。

## 派发与执行记录

- C2 依赖 C1：分支已 merge `agent/ticket-a6e2430d5e8f`（C1 PR #18 未合，因此本 PR 的 diff 在 #18 合并前包含 C1 提交；合并顺序先 #18 后本 PR）。
- 实现 lane 连续三次在会话启动阶段失败（2×spawn、1×fork），均未触碰工作区、无收尾消息；同一后端的两条普通 smoke subagent 正常。按失败补偿在达到 3 次后改为主会话降级直执行并留痕（本节 + issue 记录），实现与验证仍按 task-contract 执行。
- 未走真机/GUI：本 slice 无 UI 变更，无 Before/After 截图；面板开关与截图归 C4。
