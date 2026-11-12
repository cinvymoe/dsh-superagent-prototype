# Retrospective · P1 project bar

- Run: `run-mwd2vazl-5`, execute flow, policy A1.
- Lane: `lane-T1-project-tabs-1` (T2 / high) delivered the implementation, tests and docs in one pass; the worker added target/negative assertions, changed create/project navigation to replace, fixed the `route.create` type narrowing, and captured the visual pairs.

## What went well

- The contract fixed the route shape (`{ page: 'discuss', create: true }`), the project source (`Location.project` + provider poll) and the overflow mechanism (`scrollWidth > clientWidth` + More) up front, so the lane did not need a design round.
- The existing `GET local/issues?project=` query and `POST local/projects` route meant no host API change; only the panel and the fake server fixture moved.
- Keeping the current project in the panel's route memory made project switches survive page-tab navigation and reload without adding a second store.
- The overflow More uses a separate menu from the tabrow, so every project remains reachable even though the strip is still horizontally scrollable; the menu also marks the current project.

## Pitfalls and fixes

- **jsdom has no layout**: `scrollWidth`/`clientWidth` are 0, so overflow never triggers. The test defines instance-level configurable getters for the strip, forces a re-measure by selecting another project, and restores them with `Reflect.deleteProperty` in `finally`.
- **Type narrowing on the route union**: `route.create` is not present on every `Route` variant; use `'create' in route && route.create === true` rather than a direct property access.
- **History stacks around the create page**: navigating from create back to Discuss with a push leaves the stale create page as the back target. Submit, Cancel and project switches inside Discuss now use `navigate(..., replace = true)`.
- **Current project while the project list is still loading**: the board falls back to `projects[0]`; after creating a project, `await reloadProjects()` runs before `setProject`/navigate so the new tab and head agree.
- **Panel state vs host state**: the capture profiles were copied from a web-profile skeleton; the DSH host state includes sessions/workspaces, but the local project/issue data is isolated in the one-shot `stateDir`, so the captures show only seeded, synthetic projects.

## Residual limits

- Arrow/Home/End roving selection on the project tablist is implemented but not asserted by a test; clicking, overflow, menu selection and creation are covered.
- The More menu lists every project rather than only the off-strip ones; this is intentional so an overflowed strip can never hide a project, at the cost of a longer list when many projects exist.
- The screenshots use a fresh, synthetic state and a copied profile skeleton; they are real application captures, not mockups, but the sidebar workspace list is not part of the feature.
