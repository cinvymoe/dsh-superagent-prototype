# Requirement snapshot · C2 alignment history in the panel

## Original request (confirmed alignment `q-29218185`)

> 需求列表 讨论 支持 对齐历史 记录。比如我回复 需要修改什么地方 后生成新的对齐记录。
> 2 可以 对齐的工单进行提问。并接收提问反馈。 看看如何 完善。如果判断是 提问能否 使用 fork session 提问 然后 反馈到讨论列表

The alignment split this into several slices. **C2 (this case) is the panel display**: show every alignment round on the requirement pages, expand the current one, collapse the earlier ones, and keep a decision bound to the round the page rendered. C1 (host rounds), C3 (forked question Session), C4 (question records/API) and C5 (question entry/timeline) are separate slices.

## Confirmed decisions recorded in the plan

- The list row shows how many alignment rounds a requirement went through; no alignment means no round count.
- The detail always expands the current (last) round with its summary, slices, acceptance criteria, proposal/decision time and the execution switch.
- Every earlier round is collapsed but expandable; while collapsed it still shows its status, its decisive time and its rejection reason.
- Confirm/Send back render only on a `proposed` current round and the decision carries that round's `roundId`; the history area never offers a decision.
- Reading goes through C1's `alignmentRounds`/`currentAlignment`; a single-`alignment` record reads as one round without storage migration.

## Frozen acceptance criteria

1. `tests/panel-discuss.spec.tsx`：两轮 fixture 下详情渲染两轮，当前轮含摘要/切片/验收，旧轮折叠后可展开，打回原因与时间可见；列表行显示轮数。
2. 确认按钮只在当前 `proposed` 轮出现，并发出带当前 `roundId` 的决定请求；旧轮无决定按钮。
3. 双语键齐全，`pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts` 通过；`docs/005-panel.md` 的 Requirements 行写明轮次历史。
4. PR 描述含同视口、同主题的 before/after 截图，并标注基线版本与改动版本。
