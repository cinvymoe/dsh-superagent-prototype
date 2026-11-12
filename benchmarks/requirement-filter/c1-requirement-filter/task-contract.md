# Task contract (lane-C1-filter-1)

Deliver the frozen slice in one ticket worktree; do not commit, push, open a PR, capture screenshots or edit the issue docs.

## Allowed files

`src/client/route.ts`, `src/client/app.tsx`, `src/client/discuss.tsx`, `src/client/projects.tsx`, `src/client/locales.ts`, `tests/panel-discuss.spec.tsx`, `tests/panel-projects.spec.tsx`, `tests/navigation.spec.ts`, `docs/005-panel.md`. No new modules or test files.

## Contract

- `REQUIREMENT_FILTERS = ['pending','confirmed','closed','all']` and `RequirementFilter` live in `route.ts`; list and detail routes carry `query?: { filter?: RequirementFilter }`; create/edit routes do not; `parseRoute` drops unknown values, canonicalizes `pending` to no query, and keeps mapping saved `discuss` routes.
- `RequirementList` filters the single `GET local/issues?project=` result client-side in host order. Buckets are disjoint: closed by `state`; confirmed = open + `alignment.confirmed`; pending = open + no alignment/proposed/rejected; all = everything.
- Pills render through the existing `Pill` component in `.dt-filters`; a click uses `replace` and writes no query for pending. Section count = displayed rows.
- `discuss.empty` stays for a project with no requirements; a new copy covers a non-empty project whose current bucket is empty.
- A row opens the detail with the same filter; the detail's back button returns to the filtered list. The project switch on the list root keeps the filter and refetches.
- Update the three tests to assert the frozen criteria and extend the 005 Panel row; leave `docs/007-architecture.md` alone.

## Verification

`pnpm typecheck`; targeted vitest run of panel-discuss/panel-projects/navigation/locales/docs/styles; `git diff --check`. The worker runs the full gate, merges current main, rebuilds and captures the Before/After panel evidence.
