# Retrospective · C4

## What worked

- Merging the unmerged C2 branch first made the panel slice writable end-to-end (types + route + fixture route) without duplicating any C2 code; the later rebase onto the merged `main` produced a C4-only PR diff.
- The panel test contract was specific enough that the three cases were written once: default-off + POST + remount, dispatched read-only Tag, list-row modes.
- Capturing both sides from a detached worktree at `bee00110` kept the before build honest and reproducible; seeding both profiles through the management API kept the scenario identical.

## What cost time

- Two implementation lanes failed at spawn with no output; the worker implemented directly, so there was no independent lane report. Retry-once then take over, and say so in the record, is better than a third dispatch.
- The seeded profiles needed care: saving `source:github` returns `restarting: true` and the orchestrator is briefly unavailable, so a create issued too early can leave a requirement with no Thread; and confirming an alignment before setup finished returned “waiting for setup” while still marking the alignment confirmed, so the confirm had to be repeated after setup resolved.
- Screenshot framing: cropping to remove the unrelated DSH session sidebar needed two adjustments to find the exact panel edge (x=280 at 1440px). An element screenshot of the alignment card would have avoided the crop while still comparing the same card.

## Follow-ups

- `docs/005-panel.md` still describes the Requirements page without the execution mode; C5 owns the product documentation.
- The switch has no disabled state while a save is in flight (the `act` guard ignores the click). Fine for a single-person panel; if more controls copy this pattern, a `disabled` prop on `Switch` may be worth adding.
