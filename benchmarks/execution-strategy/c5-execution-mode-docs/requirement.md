# Requirement

Source: Discuss alignment issue `q-2f92c878`, slice C5. Trigger text:

> 走 执行阶段 feature-exec 还是走原生 提供一个 开启 按钮。
> 并讨论 如何解耦设计。

Follow-ups on the same thread:

> 能否 走新的 策略版本 进行解耦
> 默认原生
> 当前不是有执行策略 有什么用

## Frozen acceptance (from the slice assignment)

1. `pnpm vitest run tests/docs.spec.ts` passes (numbering, links, 007 module/test tables complete).
2. The docs explicitly state: native is the default; the switch on runs feature-exec; the execution mode does not participate in the Policy version; `execution-v1` is pinned with the Ticket; a host without the feature-exec service degrades to native; the mode cannot change after dispatch; a legacy Ticket without the field resolves as feature-exec.

## Frozen requirement-level conclusions the docs record

- Execution strategy is independent of the Policy version: the version covers rules, accept mode and Source Policy; the mode belongs to Executor instructions.
- `execution-v1` is the execution-contract revision; each dispatched Ticket pins `{ mode, version }`.
- A requirement with no choice dispatches native; its legacy record without `execution` is native too.
- The requirement detail can switch the mode until dispatch; after dispatch it is read-only and the route refuses.
- A legacy Ticket without `plan.execution` runs feature-exec; a host without the feature-exec service degrades feature-exec to native.
- The C5 slice only writes documentation; implementation is C1 (model/pinning), C2 (requirement storage and route), C3 (strategy seam) and C4 (panel switch).
