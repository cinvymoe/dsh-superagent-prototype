# Requirement snapshot · C3

## Original request (confirmed alignment `q-2f92c878`)

> 走 执行阶段 feature-exec 还是走原生 提供一个 开启 按钮。
> 并讨论 如何解耦设计。

Confirmed decision: the execution stage offers a switch between the feature-exec orchestration and native execution, **defaulting to native**. The execution strategy is independent of the Policy version: it carries its own `execution-v1` strategy revision, and a slice ticket pins `plan.execution = { mode, version }` when it is dispatched, so later default or revision changes never touch an already dispatched ticket. A ticket created before the field existed keeps the feature-exec flow it ran under.

## This slice (C3)

The strategy seam:

- new `src/app/execution-strategy.ts`: the `feature-exec` and `native` strategies of each contract version (execution tools, pre-run guard), resolution by the version a ticket pinned, the feature-exec fallback for a ticket without `plan.execution`, the current-version fallback for an unknown version, and the native degradation when the host registered no `featureExec` service;
- `src/app/sessions.ts`: the worker's tool list, pre-run guard and prompt read the resolved strategy, not "the ticket has a plan";
- `src/app/prompts.ts` + `src/app/context.ts` + `prompts/native-execute.md`: `composeExecute` picks the handoff by mode, with the former call shape still meaning feature-exec.

Out of scope: the feature-exec tools themselves, making the strategy handoff an editable prompt part, the local-requirement data chain and the panel (C2/C4), and the product docs prose (C5; this slice only adds the 007 Modules/Tests rows that `docs.spec.ts` requires).

## Frozen acceptance criteria

- native Ticket 的 worker 允许工具集不含任何 `feature_exec_*`，不应用 `feature_exec_start` 预运行守卫，提示词不含 feature_exec_start 且声明直接实施、不重新拆解、同样提交 PR
- feature-exec Ticket 的工具集、守卫与提示词与改动前一致（现有测试语义不变）
- 旧版本创建、`plan.execution` 缺失的 Ticket 仍按 feature-exec 解析，升级不改变在跑/可恢复 Ticket 的行为
- 宿主未注册 featureExec 服务时，slice Ticket 按 native 策略降级，不出现指向 feature_exec_start 的提示或守卫
- `pnpm vitest run tests/execution-strategy.spec.ts tests/prompts.spec.ts` 与 `pnpm typecheck` 通过
