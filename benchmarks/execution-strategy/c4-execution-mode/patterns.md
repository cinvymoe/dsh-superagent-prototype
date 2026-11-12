# Reusable patterns

## Mirror the host's lock in the view, from the same fact the host uses

- The panel decides “read-only” from `thread.tickets.length > 0`, which is the same Thread link list the detail already renders as “关联工单”, and the host decides it from `tickets.list().some(ticket => ticket.plan?.issueId === id)`. They agree because both answer “did this requirement dispatch?”; a lifecycle flag such as `alignment.status === 'confirmed'` would not, since a confirmed requirement can briefly have no Tickets and a rejected one can never have any.
- Deriving visibility from one fact also removes the need for a disabled switch: while pending there is a switch, after dispatch there is a Tag, never both. A rendered `disabled` control would still suggest an editable setting.

## A view control writes through the host, never optimistically

- The switch has no local state: `checked` comes from `requirementExecutionMode(issue)` on the last `GET local/issues/:id`, and `onChange` runs inside the page's existing `act` wrapper — busy guard, `await call(...)`, then `reload()`; failures go through `notify(errorText(failure))`, which already localizes `userError.executionLocked` / `executionMode`.
- This keeps the DOM honest (a refused save cannot show a state the host does not have) and reuses the C2 route instead of a second client-side write path.

## One label function for one enum

- `executionLabel(t, issue)` maps the normalized mode to its localized name, and both the list row and the read-only detail Tag render through `executionTag`. Adding a future mode means touching the normalizer and one label function, not every view that shows a mode.
- The same rule applied to the fixture: `localThread(issue, dispatched)` gained one boolean and reuses `ticketSummary`, rather than building a second Ticket shape that could drift from `ThreadPageView`.

## When a prerequisite merges mid-slice, rebase instead of restacking

- The branch started by merging the unmerged C2 branch (`bee00110`). Once PR #20 merged into `main`, `git rebase --onto target/newmain bee00110` dropped the merge and replayed only the C4 commit, so the PR diff became C4-only without rewriting review evidence.
- The screenshot baseline is also a commit (`bee00110`), not a branch name: it is the last tree that contains C1 + C2 without C4, so the before build stays reproducible after the merge.
