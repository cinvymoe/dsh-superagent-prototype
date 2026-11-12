# Requirement snapshot · C1 alignment rounds

## Original request (confirmed alignment `q-29218185`)

> 需求列表 讨论 支持 对齐历史 记录。比如我回复 需要修改什么地方 后生成新的对齐记录。     2 可以  对齐的工单进行提问。并接收提问反馈。  看看如何  完善。如果判断是 提问能否 使用 fork session 提问 然后 反馈到讨论列表

The alignment split this into several slices. **C1 (this case) is the host side**: keep every alignment round, let a person's decision name the current round, feed a rejection back to the Aligner Session, and dispatch only the confirmed latest round. Asking questions through a forked Session and rendering the history in the panel belong to later slices.

## Confirmed decisions recorded in the plan

- Every Aligner proposal appends a round; an undecided round becomes `superseded` when a later proposal arrives, while confirmed/rejected rounds keep their outcome.
- A rejection records the reason and also posts it to the requirement Thread as a human local Trigger, so the Aligner Session receives the feedback and can propose the next round.
- A decision only applies to the current (latest) round; a decision naming an older round is refused with a clear code.
- A confirmed requirement is frozen for alignment: a new proposal is refused and the round count does not grow.
- Dispatch reads only the confirmed latest round.
- A record written before rounds existed (single `alignment` slot) reads as one round; storage is not bulk-migrated.

## Frozen acceptance criteria

1. `tests/local.spec.ts`：连续两次 `propose` 得到两轮且旧 `proposed` 为 `superseded`；`decide('reject','缩小范围')` 后该轮 `rejected` 且 `reason` 正确，同时新增一条 human 本地触发、文本含打回原因；此后 `propose` 追加第三轮；直接写入带旧 `alignment` 字段的记录能读出一轮历史。
2. `tests/local-align.spec.ts`：打回后 Aligner 会话收到该反馈并再次 `orchestrator_align` 成功；确认只派发最新轮的切片；带旧 `roundId` 的决定经 HTTP 返回拒绝且带明确 code；最新轮已确认后再 `orchestrator_align` 返回明确错误且轮数不增加。
3. `tests/locales.spec.ts` 通过（新错误码有中英双语条目），`pnpm typecheck` 与上述两个测试文件通过。
