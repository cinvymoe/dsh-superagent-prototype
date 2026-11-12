# Requirement snapshot · C4

- Alignment issue: `q-29218185`, slice `C4`, confirmed in the Discuss panel at 2026-11-12T16:09:39.804Z
- Source trigger: `737d9c88d28dd4923819c9e8c6317bde` (`local:q-29218185`)

## Original request

> 需求列表 讨论 支持 对齐历史 记录。比如我回复 需要修改什么地方 后生成新的对齐记录。
> 2 可以  对齐的工单进行提问。并接收提问反馈。  看看如何  完善。如果判断是 提问能否 使用 fork session 提问 然后 反馈到讨论列表

## Frozen scope of this slice

A requirement can be asked about one of its dispatched Tickets; the question and its answer live on the requirement record
(`LocalIssue.questions[]`) and never in the Engine.

- `ask` validates (Ticket belongs to the requirement, worker Session started, text, per-requirement limit), appends an
  `asked` record synchronously and returns; the answer is produced by a background queue through the C3 `Questions` port.
- Success records `answered` + non-empty `answer`; failure records `failed` + `error`; `retry` re-queues the same record.
- A start re-queues every `asked` record; a stop leaves in-flight records `asked`.
- No Trigger/Eval/Ticket/Assignment is written and the Ticket is only read.

Panel entry, waiting/failure display and answer rendering belong to C5; the fork port itself belongs to C3.

## Acceptance criteria (frozen)

1. `tests/local.spec.ts`: a Ticket with a started session returns `asked` at once; a non-associated Ticket is refused with a
   clear code; a port result records `answered` with a non-empty answer; a port failure records `failed` with the error and
   `retry` re-queues it.
2. `tests/local-align.spec.ts`: the Ticket's `inputs`/`assignments`/`ended` are unchanged and there is no new Trigger or
   Decision; a restart re-queues `asked` questions; a Ticket that never started a session is refused with a clear code.
3. The new error codes have both language entries; `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts
   tests/locales.spec.ts` and `pnpm typecheck` pass.
