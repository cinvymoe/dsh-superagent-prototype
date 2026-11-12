# Retrospective · C4

## What went well

- Splitting the record/queue from `LocalIssues` kept the write path obvious (`putIssue` is the only new method), and the
  `TicketAnswers` seam let the unit tests prove "returns before the port answers" without a DSH host.
- The lane's self-test reports were accurate: the targeted, typecheck and full-suite numbers were reproduced, including the
  host-environment failures, so the review only had to verify semantics.
- The runtime test that seeds a `turn/end` and then drives the fork's answer turned the composition (HTTP → queue → real
  `Questions` → fork → record) into an assertable path instead of leaving it to the C3 port tests.

## Pitfalls hit (and the fix)

1. The typed `Api` route table makes `tests/fixtures/panel-server.ts` fail typecheck when a route is added even though the
   panel does not call it yet. Add the mechanical stub in the same commit.
2. A port that throws is not covered by a result-union contract; catch it and record `failed`, and add a case for it — an
   unhandled rejection would otherwise leave the record `asked` with no log.
3. An unexpected error inside `answer()` (e.g. a store read) would be swallowed by the fire-and-forget chain; the `warn` hook
   makes it visible while the restart re-queue still recovers the work.
4. `questionLimit` must measure retained records, not just active ones; document that the oldest stay readable at the cap.
5. Unknown requirement first, empty text second: resource-not-found must win over validation so HTTP answers 404 for an
   unknown id regardless of the body.

## Follow-ups for C5 (panel)

- Consume the typed routes and render `asked`/`answered`/`failed` with a retry action on `failed`; no polling loop is needed —
  reload the requirement detail on demand.
- Render the answer as Markdown; the answer can quote code and paths from the worker's context.
- Do not fork Sessions from the panel; everything goes through the host routes.
