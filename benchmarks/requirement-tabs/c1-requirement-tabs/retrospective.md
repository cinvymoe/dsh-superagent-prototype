# Retrospective · C1 requirement tabs

- Run: `run-mwd8n3ey-2`, execute flow, policy A1.
- Lane: `lane-C1-1` (T2 / high) delivered the implementation, tests and docs in one pass; the worker reviewed the diff, aligned the local source copy with the new tabs, fixed the two test files' trailing newlines, captured the visual pairs, and ran the full gate.

## What went well

- The frozen acceptance criteria fixed the tab order, the two page names, the description-only form and the project-switch landing points, so the lane did not need a design round.
- Deriving the title on the host (`LocalIssues.create`) instead of the client keeps one source of truth and lets the thread text follow the same rule; `POST local/issues` stays usable by older callers that still send an explicit `title`.
- `PageHead`'s optional `back` prop gave the two tab-root pages a head with no back button and the detail an explicit "back to requirements" target without touching every other page.
- Old `page=discuss` routes migrate in `parseRoute`, so a saved session opens the new detail/list/create page instead of a white screen.
- The jsdom fixture mirrors the host's title derivation and now records the original requirement Trigger in the thread timeline, which made the "text appears once" rule testable at the panel boundary.

## Pitfalls and fixes

- **Duplicated requirement text**: a derived title is a prefix of the description, so the old `title + "\n\n" + body` Trigger text would repeat the first line. `create` uses the description alone when the title was derived; an explicit title keeps the old concat so legacy records and other callers do not change.
- **Detail page duplication**: the requirement card and the discussion timeline both rendered the submitted text. The timeline now skips the earliest trigger whose text equals `issue.body || issue.title`; legacy `title+body` records keep their original message because their trigger text differs from the body.
- **Return from a deep-linked detail**: relying on the history stack would show Overview when a detail route loads with an empty stack. The detail passes an explicit back target (`{ page: 'requirements' }`, replace), so the destination is deterministic.
- **`'create' in route` narrowing**: `create` exists only on the requirements union member; keep the guard before reading `route.create` in the project bar and the new-project button.
- **Tab-root back buttons**: Page tab roots should not show a back button labelled Overview; both requirement pages pass `back={false}` and the standalone create page passes its own requirement-list target.

## Residual limits

- Requirements created before this change with an explicit separate title and body keep the old thread text; only description-derived submissions follow the single-occurrence rule.
- The requirements list does not paginate; it uses the existing newest-first project query as before.
- The screenshots use a fresh, synthetic state and copied profile skeletons; they are real application captures, not mockups.