# Task contract · C1 · Open a linked Ticket's Executor Session from the requirement detail

Ticket: `e31c18f685181583474b8abb3739bc6b` (slice C1 of alignment `q-b91966d0`)
Worktree: `/data/project/workspace/dsh-worktrees/executor-session-e31c18f68518`
Branch: `agent/executor-session-e31c18f68518`, based on deployment `main` @ `6ed5fded` (already checked out, clean)
Lane tier: T1 — one view's conditional control + one test + one doc sentence.

## Goal

In the requirement detail page's 关联工单 (linked Tickets) section, every linked Ticket that has started an Executor
Session shows a localized **打开 Session / Open Session** button next to (or right-aligned after) its title; clicking it
opens only that Ticket's Executor Session. A linked Ticket with no started session renders no Session button. The Ticket
title link keeps navigating to that Ticket's Execution detail page. No new locale keys.

Read first: `docs/issues/e31c18f685181583474b8abb3739bc6b.md` (frozen acceptance criteria), `src/client/discuss.tsx`
(`RequirementDetail`), `src/client/widgets.tsx` (`SessionButton`), `src/client/rows.tsx` (`TicketLine` session button
usage), `src/client/ticket.tsx` (assignment-row `dt-row-actions` pattern), `src/client/locales.ts` (`openSession`),
`src/app/views/records.ts` (`ticketSummary().sessionId`), `tests/panel-discuss.spec.tsx`, `tests/fixtures/panel-server.ts`
(`ticketSummary`, `threadPages`, `GET local/issues/:id`), `tests/fixtures/panel.tsx`, `docs/005-panel.md` (Requirements row).

## Fixed design decisions (do not redesign)

1. **View** — `src/client/discuss.tsx`, `RequirementDetail`'s linked-Tickets `Section` (currently
   `data!.thread.tickets.map(ticket => ...)`). Keep the existing `<Icon name="decision" size={14} />` and
   `<div className="dt-row-main">`; keep the title `<button className="dt-textlink">` navigating to
   `{ page: 'execution', id: ticket.id }` exactly as today.
   Add, only when `ticket.sessionId` is truthy, a sibling action container after `dt-row-main`:
   `<div className="dt-row-actions"><SessionButton variant="outline" sessionId={ticket.sessionId} /></div>`.
   Import `SessionButton` from `./widgets.tsx` (already exports it); do not pass a label, so the button uses
   `t('openSession')` (打开 Session / Open Session). Do not add a new locale key or change existing keys.
2. **Why the data is already there** — `ticketSummary` in `src/app/views/records.ts` sets
   `sessionId: ticket.assignments.some(item => item.startedAt) ? workerSessionId(ticket.id) : ''`, and
   `GET local/issues/:id` returns `threadDetail(...)`, whose `tickets` are `ticketLine(...)` spread from `ticketSummary`.
   Do not change server code, API types, or the fixture shape unless the TypeScript compiler requires the import to be
   added. Do not route through `POST tickets/:id/retry` or any action; opening a Session is purely `openSession(id)`.
3. **Test** — `tests/panel-discuss.spec.tsx`, one new `it(...)` (plus fixture wiring inside the test only; do not
   change shared fixture defaults). Use `at({ page: 'requirements', id: 'q-fixture' })`, `server.localProjects = [PROJECT]`,
   `server.localIssues = [localIssue('Linked requirement')]`, and set
   `server.threadPages = () => ({ ...threadSummary(), correlated: [], decisions: [], earlier: null, context: [], timeline: [],
   tickets: [...] })` with three linked Tickets built by the fixture's `ticketSummary` helper:
   - `ticketSummary()` — id `t1`, title `修复回归`, session id `worker-t1` (default);
   - `ticketSummary({ id: 't2', title: '尚未启动', sessionId: '' })` — no session;
   - `ticketSummary({ id: 't3', title: '另一个工单', sessionId: 'worker-t3' })`.
   Find the linked-Tickets section by its `.dt-section-name` text `zh['discuss.tickets']` (other page sections contain
   rows too), then assert:
   - the section's rows render the three titles in order;
   - exactly two Session buttons (`button.dt-btn` whose text is `zh['openSession']`) exist — on the `t1` and `t3` rows, none on
     the `t2` row;
   - clicking the `t3` row's Session button pushes exactly `['worker-t3']` into `server.opened` (import `server` from
     `./fixtures/panel-server.ts`, already imported) — proving it opens only that Ticket, and only once;
   - clicking the `t1` title link (the `.dt-textlink` in that row) requests `GET tickets/t1` and shows the execution detail
     for `修复回归` (the existing fixture default has `ticketDetails.t1`); this keeps the "title still enters Execution
     detail" behaviour covered.
   Then `await remount(en)` and assert the same section shows the `en['openSession']` label (`Open Session`) for the
   sessioned Tickets and still none for `t2`. No `tests/locales.spec.ts` change.
   Use the existing helpers (`settle`/`remount`/`click`/`all`/`text`) and keep the file's formatting/import style.
4. **Docs** — `docs/005-panel.md`, the **Requirements** row (line with `| Requirements |`): extend the existing sentence
   so the detail description says the linked Tickets each offer **Open Session** to open that Ticket's Executor Session
   (only for Tickets that have started one). Keep the row one table cell and keep existing required phrases intact
   (`an optional absolute `worktreeRoot` (empty keeps the Execution ticket directory root)` lives in the New requirement
   row and must not be touched). Do not edit `docs/007-architecture.md` or any other product doc.
5. **Scope guard** — no CSS changes expected (`.dt-row-actions` already right-aligns in a flex `.dt-row`); if a visual
   gap requires one, get it wrong-proof: prefer no CSS. Do not add a new locale key, button component, route, API field,
   or a Session button anywhere else (Trigger page, Ticket page rows keep existing behaviour).

## Do not

- Do not commit, push, open a PR, or edit `docs/issues/` beyond nothing (the worker owns those); the lane only edits the
  four paths above.
- Do not weaken existing test assertions or change shared fixture defaults.
- Do not touch `pnpm-lock.yaml`, `package.json`, or unrelated files.

## Acceptance for this lane

1. `pnpm vitest run tests/panel-discuss.spec.tsx` passes (the new test fails before the view change, passes after).
2. `pnpm typecheck` passes.
3. `pnpm vitest run tests/docs.spec.ts tests/locales.spec.ts` passes (no doc/locale drift).
4. Report: files changed, the exact test names added, commands run with pass/fail counts, and any risk/limitation.
