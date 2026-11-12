# Requirement snapshot · C4

## Original request (confirmed alignment `q-2f92c878`)

> 走 执行阶段 feature-exec 还是走原生 提供一个 开启 按钮。
> 并讨论 如何解耦设计。

Follow-up messages on the same thread:

> 能否 走新的 策略版本 进行解耦
> 默认原生
> 当前不是有执行策略 有什么用

Confirmed decision: the execution stage offers a switch between the feature-exec orchestration and native execution, **defaulting to native**. The execution strategy is independent of the Policy version; a dispatched slice ticket pins `plan.execution = { mode, version: 'execution-v1' }`, and a requirement that already dispatched Tickets is read-only. The decoupling lands in five slices; C4 is the panel.

## This slice (C4)

- The requirement detail's “对齐结果” card shows a switch labelled “执行阶段使用 feature-exec” while `alignment.status === 'proposed'` and the requirement has no linked Tickets. Off is native; turning it on saves `{ mode: 'feature-exec' }` through `POST local/issues/:id/execution` and reloads the detail, so the checked state always comes from the host.
- Once the thread carries dispatched Tickets the switch disappears: the card shows the current mode as a Tag plus “已派发工单，执行方式固定。”.
- Every requirement list row shows a mode Tag; a requirement without `execution` shows “原生”.
- Out of scope: requirement storage and the route (C2, already merged), strategy resolution in sessions/prompts (C3), project-level/global defaults, mixing modes inside one requirement, changing the mode after dispatch, `docs/005-panel.md` (C5).

## Frozen acceptance criteria

- 需求详情在对齐提案待确认时显示 Switch，默认关闭（即 native）；开启后调用 `POST local/issues/:id/execution` 持久化为 feature-exec，刷新后仍为 feature-exec
- 需求已有派发 Ticket 后开关隐藏或只读，并以 Tag 显示当前模式；需求列表行显示模式，未选择时显示 native
- `pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts` 通过
- PR 描述包含同视口、同主题、同场景的 Before/After 截图，并标注基线与改动版本
