# Reusable patterns · C1 requirement tabs

## One description field with a derived title

- When a form collapses a title and a body into one field, derive the title on the server (or in the single record owner), not in the view: `first non-empty line -> trim -> collapse whitespace -> slice(200)`.
- Keep the explicit `title` input optional in the API so older clients and tests keep working; the record still stores a real `title` and the whole description as `body`.
- Do not prefix a derived title to the thread text (`title + "\n\n" + body`); the title is a prefix of the body, so the full text would appear twice. Use the description alone when the title was derived, and keep the explicit-title concatenation only for callers that pass a separate title.

## Two page tabs over one record area, with a deterministic detail return

- Model the tab roots as first-class routes (`newRequirement`, `requirements`) and the detail as a sub-route of the list (`requirements` + `id`); the list tab stays selected on the detail.
- Tab-root pages pass `back={false}` to the shared `PageHead`, so they do not show a contextual "Overview" back button; sub-pages pass an explicit `{ label, onClick }` back target instead of relying on the stack, which makes deep links deterministic.
- Migrate removed route names in `parseRoute` (`discuss` + `id` -> detail, `+ create` -> create page, bare -> list) so saved sessions never land on an empty panel.
- Project switching is a route decision: keep the current requirement tab and refetch through its project id; any other tab goes to the list. Use `navigate(..., replace)` when the target is the same tab so project browsing does not grow the back stack.

## Detail page that shows the record once

- The requirement card is the canonical place for the submitted text; skip the thread's original Trigger from the rendered timeline when its text equals the record's body (or title when there is no body), so the page shows the full text once.
- Keep legacy records readable: match on the actual stored text instead of assuming every record was created by the new single-field form.