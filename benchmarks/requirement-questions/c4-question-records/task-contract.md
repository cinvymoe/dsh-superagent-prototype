# Implementation contract · C4

See `docs/issues/62fa6ab64496c159c8aca2b897669319.md` for the full slice record. The contract the implementation follows:

## Data

- `LocalQuestion { id, ticket, text, status: 'asked' | 'answered' | 'failed', askedAt, answeredAt?, answer?, error? }`
- `LocalIssue.questions?: LocalQuestion[]` (newest last; absent when empty; no migration).

## Behaviour

- `LocalQuestions.ask(issueId, ticketId, text)` → unknown issue `undefined`; empty text `questionText`; unknown Ticket
  `unknownTicket`; `ticket.plan?.issueId !== issueId` `questionTicket`; no assignment with `startedAt` `questionNoSession`;
  `questions.length >= 20` `questionLimit { max }`. Success writes `asked` synchronously, queues the answer and returns
  `{ issue, question }`.
- Background answer: missing Ticket → `failed`; port result `ok` with a non-empty trimmed answer → `answered`; anything else
  (port failure, thrown port, empty answer) → `failed` with a message. Re-reads the requirement and only rewrites the record
  while it is still `asked`. A stop/abort writes nothing.
- `retry(issueId, questionId)` → unknown `undefined`; not `failed` `questionNotFailed`; re-checks Ticket existence and
  association; resets the same record to `asked`, clears the previous outcome, queues it.
- `resume()` re-queues every `asked` record, never twice; `idle()` settles all queued answers; `stop()` stops queueing and
  waits.
- HTTP: `POST local/issues/:id/questions { ticket, text }` and `POST local/issues/:id/questions/:questionId/retry`, both
  answering `{ issue: LocalIssueView, question: LocalQuestion }`; unknown issue/question 404, refusals 400 + `code`.
- No Engine write: only `KV.local.issue` records are written; `store.tickets` is read.

## Verification

```sh
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts
pnpm typecheck
```
