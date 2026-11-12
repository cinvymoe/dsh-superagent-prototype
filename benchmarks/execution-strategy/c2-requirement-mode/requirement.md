# Requirement snapshot · C2

## Original request (confirmed alignment `q-2f92c878`)

> 走 执行阶段 feature-exec 还是走原生 提供一个 开启 按钮。
> 并讨论 如何解耦设计。

Follow-up messages on the same thread:

> 能否 走新的 策略版本 进行解耦
> 默认原生

Confirmed decision: the execution stage offers a switch between the feature-exec orchestration and native execution, **defaulting to native**. The execution strategy is independent of the Policy version; it carries its own `execution-v1` strategy revision, and a slice ticket pins `plan.execution = { mode, version }` when it is dispatched, so later default or revision changes never touch an already dispatched ticket. A requirement that already dispatched tickets is read-only.

## This slice (C2)

The requirement side of that decision:

- `LocalIssue.execution?: ExecutionMode` — absent means `native`, which is also how records created before the field existed dispatch;
- `requirementExecutionMode()` normalizes the absent field to `native` for every reader;
- `POST local/issues/:id/execution` accepts `{ mode: 'native' | 'feature-exec' }`, refuses unknown modes with `executionMode`, and refuses any change once a ticket with `plan.issueId === id` exists with `executionLocked`, leaving the record untouched;
- `LocalIssues.planInput()` carries `{ mode, version: EXECUTION_STRATEGY_REVISION }` and `Runtime.dispatchPlan()` passes it to `Engine.acceptPlan`, so each confirmed slice ticket pins the requirement's current mode.

Out of scope: the core model and pinned field (C1), the strategy registry and Session/prompt decoupling with legacy-ticket resolution (C3), the Discuss panel switch (C4), product docs (C5).

## Frozen acceptance criteria

- 新建需求未指定时为 native；调用新接口改为 feature-exec 后，读取需求返回 feature-exec
- 需求已有派发 Ticket 后调用新接口被拒绝，需求记录保持不变
- 确认对齐后生成的每个 Ticket 的 `plan.execution` 与需求当前模式一致；存量无字段需求按 native 派发
- `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts` 与 `pnpm typecheck` 通过
