# Reusable patterns

## Store the choice, normalize at read

- Keep the requirement's execution mode as one optional field (`execution?: ExecutionMode`) and export one normalizer (`requirementExecutionMode`) that maps absence to the default. Every reader — dispatch, the panel, tests — goes through the normalizer, so legacy records need no migration and no startup backfill, and "default native" has exactly one definition.
- Contrast with the default-at-write approach C1 used for `plan.execution`: a ticket pins its value when dispatched (write the default), while a requirement can stay unspecified until it dispatches (read the default). Both are consistent because the requirement is the input and the ticket is the frozen record.

## Gate a mutation on observable state, not on a lifecycle flag

- `setExecution` refuses when `tickets.list().some(ticket => ticket.plan?.issueId === id)`, not when `alignment.status === 'confirmed'`: dispatch is the fact that makes the mode read-only, and it stays true even after the alignment is re-proposed or the tickets end. Deriving the gate from the same query the dispatcher uses keeps the two paths from disagreeing.
- Validate before writing and throw a structured `UserError`; the HTTP layer then returns the code without a second validation copy, so a future caller (a tool, a CLI) gets the same rule.

## Propagate a pinned contract through an explicit plan input

- `planInput()` returns the strategy next to the thread/triggers/actor, and `Runtime.dispatchPlan` forwards it to `Engine.acceptPlan`. The engine never reads local-requirement storage, so the core stays independent of the local board and C1's pinning logic is reused unchanged.
- When an `Api` route is added, its type is a contract that the panel test fixture also implements. `tsc` flags the missing fixture route immediately, which is the cheapest possible reminder to mirror the route's refusal semantics.

## Add an error code and its text in one change

- `USER_ERRORS` keys are a typed union and `tests/locales.spec.ts` asserts every key has Chinese and English text. Adding `executionMode` / `executionLocked` without the two `userError.*` lines fails the full suite, so treat the code, the text and the panel's use of the code as one unit of work.

## Produce honest red evidence after a lane fallback

- If tests and implementation land in the same turn (a failed-lane fallback), stash only the source and fixture changes (`git stash push -- src tests/fixtures/panel-server.ts`), run the new specs against the old tree to record the genuine pre-change failure, then `git stash pop`. The log is then a real red baseline instead of a claim.
