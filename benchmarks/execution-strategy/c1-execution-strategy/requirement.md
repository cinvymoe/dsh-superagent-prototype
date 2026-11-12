# Requirement snapshot · C1

## Original request (confirmed alignment `q-2f92c878`)

> 走 执行阶段 feature-exec 还是走原生 提供一个 开启 按钮。
> 并讨论 如何解耦设计。

Confirmed decision: the execution stage offers a switch between the feature-exec orchestration and native execution, **defaulting to native**. The execution strategy is independent of the Policy version: it carries its own `execution-v1` strategy revision, and a slice ticket pins `plan.execution = { mode, version }` when it is dispatched, so later default or revision changes never touch an already dispatched ticket.

## This slice (C1)

Core contract only:

- `ExecutionMode`, `EXECUTION_STRATEGY_REVISION = 'execution-v1'`, `ExecutionStrategy = { mode, version }`, `DEFAULT_EXECUTION_STRATEGY`;
- `Ticket.plan.execution?`, `AssessmentOutcome` accept plan field, `Evals.acceptPlan` and `Engine.acceptPlan` accept an optional `execution`;
- new slice tickets pin `input.execution ?? DEFAULT_EXECUTION_STRATEGY`; reuse never rewrites it.

Out of scope: local-requirement storage/API/dispatch pass-through (C2), strategy registry and session/prompt decoupling with legacy-ticket resolution (C3), panel switch (C4), product docs (C5).

## Frozen acceptance criteria

- `acceptPlan` 传入 `{mode:'native', version:'execution-v1'}` 时，每个新建 slice Ticket 的 `plan.execution` 与之一致
- 未传 execution 时，新建 Ticket 固定为 `{mode:'native', version:'execution-v1'}`（新默认）
- 同一 issue 重复确认复用既有 Ticket，且不改变其已固定的模式
- `pnpm vitest run tests/core-engine.spec.ts` 与 `pnpm typecheck` 通过
