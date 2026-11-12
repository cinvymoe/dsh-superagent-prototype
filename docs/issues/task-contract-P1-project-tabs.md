# Task contract · P1 · Top project tabs, overflow More menu and standalone project creation

Ticket: `72eef87fa22817c7628e4a74ecffb1a0` (slice P1 of alignment `q-539e143e`)
Worktree: `/root/.dsh/state/superagent-test/work/tab-72eef87fa228`
Branch: `agent/tab-72eef87fa228`, based on deployment `main` @ `3b8c6a8` (merge already applied).

## Goal

Deliver the frozen P1 slice: a project tab strip at the top of the panel (each local project a `role=tab`, current one `aria-selected`, a `More` button when the strip overflows), a standalone New project page reached from a top-level button (not inside Discuss), and a Discuss page scoped to the current project without the old project list, inline create form, or project-filter links. Also update the two product docs and add jsdom tests. Do not commit; the worker reviews, runs the full gate, captures screenshots and opens the PR.

Read first: `docs/issues/72eef87fa22817c7628e4a74ecffb1a0.md` (frozen acceptance criteria), `src/client/app.tsx`, `src/client/discuss.tsx`, `src/client/provider.tsx`, `src/client/route.ts`, `src/client/controls.tsx`, `src/client/widgets.tsx`, `src/client/client.css`, `src/client/locales.ts`, `tests/panel-discuss.spec.tsx`, `tests/fixtures/panel-server.ts`, `tests/fixtures/panel.tsx`, `docs/005-panel.md`, `docs/007-architecture.md`.

## Fixed design decisions (do not redesign)

1. **Route** (`src/client/route.ts`)
   - Discuss list route gains an optional `create?: true` sub-view:
     `| { page: 'discuss'; id?: undefined; create?: true; query?: undefined }`.
   - `parseRoute` accepts `create === true` for a Discuss route without an `id`, and drops a non-boolean value.
   - `routeLabel` returns `t('discuss.newProject')` for `{ page: 'discuss', create: true }`.
   - `Location` gains `project?: string`; `initialLocation` reads a non-empty string `stored.project`; `remember` already serializes the whole location.
   - `TABS` is unchanged. The New project page is a Discuss sub-view, so the Discuss page tab stays selected and the page tablist stays keyboard-usable.
2. **Current project** is `Location.project`, exposed through `PanelContext`:
   - `PanelContext` gains `project: string | undefined` and `setProject: (id: string | undefined) => void`.
   - `PanelProvider` accepts `project` and `setProject` props (defaults: `undefined`, a no-op) and includes them in the context.
   - `App` keeps `project` in `location`; `move` spreads the current location first (`{ ...current, ...next(current), group: lastSettingsGroup(current) }`) so navigate/back/openTab keep the project; add `setProject` that only sets `location.project`.
   - A project tab click calls `setProject(id)` then navigates to the Discuss list: `navigate({ page: 'discuss' })`, using `replace = true` when already on the Discuss list (`route.page === 'discuss' && route.id === undefined && !route.create`), otherwise pushing. A click on the already-current tab does nothing.
3. **Projects data** (`src/client/provider.tsx`)
   - `PanelProvider` also polls `GET local/projects` (`usePoll(() => call('GET local/projects'), [call])`).
   - `PanelData` gains `projects: LocalProject[]` (empty when not loaded) and `reloadProjects: () => Promise<void>`.
4. **Project bar** — new file `src/client/projects.tsx`, exported `ProjectBar` and `NewProjectPage`.
   - Rendered in `app.tsx` between `Header` and the page `SegmentedTabs`, on every panel route.
   - Structure:
     - outer `<div className="dt-project-bar">`
     - when there is at least one project, a `<div className="dt-project-strip" role="tablist" aria-label={t('discuss.projects')}>` containing one `<button type="button" role="tab" aria-selected={current} className="dt-project-tab" tabIndex={current ? 0 : -1}>` per project, in the order `GET local/projects` returns.
     - the strip is horizontally scrollable; when `strip.scrollWidth > strip.clientWidth + 1` a More button appears after the strip: `<Button className="dt-project-more" aria-haspopup="menu" aria-expanded={open}>` labelled `t('project.more')`, with a chevron-down icon. Its popover `<div className="dt-project-menu" role="menu" aria-label={t('project.menu')}>` lists **all** projects as `<button type="button" role="menuitemradio" aria-checked={current}>` with the project name (repository may appear as secondary mono text); choosing one closes the menu and selects that project (same navigation as a tab click). The menu closes on outside pointerdown and Escape.
     - a top-level `<Button variant="primary" size="sm" className="dt-project-new">` labelled `t('discuss.newProject')` with a plus icon, on the right of the bar, which navigates to `{ page: 'discuss', create: true }`. It is always rendered, including with zero projects.
   - Overflow is measured in an effect plus (when available) a `ResizeObserver` on the strip and its tab children; re-measure when projects change, the current project changes, or copy changes. Scroll the selected tab into view with optional chaining (`scrollIntoView?.`).
   - ArrowLeft/ArrowRight/Home/End in the project tablist select and focus the neighbouring project tab (same roving model as `SegmentedTabs`, but selecting also changes the current project); do not break Tab focus.
   - Visual distinction from page tabs: project tabs are chips (rounded, bordered, compact, active uses an accent tint); page tabs keep the existing equal-width segmented look. Project tabs keep their own tablist and aria label.
5. **Discuss page** (`src/client/discuss.tsx`), rewrite `DiscussBoard`:
   - `const { project } = usePanel()`, `const { projects } = usePanelData()`, `const active = projects.find(item => item.id === project) ?? projects[0]`.
   - Poll `GET local/issues` with `{ query: { project: active.id } }` when `active` exists; otherwise resolve `{ issues: [] }` without a request. Do not fetch all issues and filter client-side.
   - Page head: when `active` exists, title is `active.name`; children show `t('discuss.subtitle')`, `<span className="dt-mono">{active.repository}</span>`, and when present the worktree root as `<span className="dt-mono">{active.worktreeRoot}</span>`. Without a project, title stays `t('discuss.title')` with the subtitle.
   - With no projects: render a `Section` (title `t('discuss.issues')`) whose body is the `t('discuss.noProjects')` hint; no requirement form, no requirement list.
   - With a project: render the new-requirement form (no project `<select>`, no project section) whose submission posts to `active.id`; keep title/body state and max lengths. Show the form heading `t('discuss.new')` and the target project in the card (for example a `Tag tone="neutral"` with `active.name`), so the target is explicit.
   - Requirement list: `Section title={t('discuss.issues')} count={issues.length}` scoped to the polled issues; empty hint `t('discuss.empty')`; row title opens the detail route. Remove the per-row project tag and the old filter/'useProject'/'allProjects' code.
   - Remove all project-list, inline create-project and filter state/handlers from this file. Keep `DiscussIssue` unchanged (it still shows the issue's project).
6. **New project page** (`NewProjectPage` in `src/client/projects.tsx`):
   - Rendered by `app.tsx` for `route.page === 'discuss' && route.create` instead of `DiscussBoard`.
   - `PageHead` title `t('discuss.newProject')`; form card with the existing three inputs (name, repository, worktree root), the existing hint `t('discuss.projectWorktreeRootHint')`, and Create (`t('discuss.createProject')`) / Cancel (`t('cancel')`) actions.
   - Submit: validate the same way as the old inline form (trim; require non-empty name and repository; omit `worktreeRoot` when blank after trim), `POST local/projects`, then `await reloadProjects()`, `setProject(project.id)`, and `navigate({ page: 'discuss' })`. On failure show `notify(errorText(failure))` and stay on the page.
   - Cancel and the PageHead back button must not create anything: Cancel navigates to `{ page: 'discuss' }`.
   - Validation and empty handling stay: max lengths 80/200/4096, worktree root only sent when non-empty, server errors surfaced as the localized toast.
7. **Locales** (`src/client/locales.ts`)
   - Add `project.more` (`更多` / `More`) and `project.menu` (`全部项目` / `All projects`).
   - Remove `discuss.useProject` and `discuss.allProjects` (no longer used).
   - Keep `discuss.projects` for the project tablist aria label, and keep all create-project copy.
8. **Styles** (`src/client/client.css`): add rules for `.dt-project-bar`, `.dt-project-strip`, `.dt-project-tab` (+ active state via `aria-selected="true"`), `.dt-project-more`, `.dt-project-more-wrap`, `.dt-project-menu`, `.dt-project-option` (+ `aria-checked="true"`), `.dt-project-new`, plus the new project page if it needs any (it can reuse `dt-card`, `dt-form`, `dt-text-input`, `dt-actions`). Keep the one-rule-per-line stylesheet format; hide the strip's scrollbar; make the bar wrap on narrow screens without breaking measurement; use existing DSH tokens only.
9. **Test fixture** (`tests/fixtures/panel-server.ts`)
   - `POST local/projects` returns a project with a unique id when the fixed one is taken (for example `p-fixture`, then `p-fixture-2`, …) and keeps the `worktreeRoot` only when non-empty.
   - `GET local/issues` declares the `project` query and filters `server.localIssues` by it.
   - `POST local/issues` stores the issue with `body.project` (instead of always `p-fixture`).
   - Keep `server.misuse` empty.
10. **Tests**
   - Update `tests/panel-discuss.spec.tsx`: project creation now goes through the top button and the standalone view; after creating, the project tab is current and Discuss shows that project; requirement submission posts the current project; empty-project state shows the create-first hint; no `.dt-select` remains; requirement detail still shows its project.
   - Add `tests/panel-projects.spec.tsx` (new file):
     - two projects render as `role=tab` in the project tablist, the first/current has `aria-selected="true"`, page tabs still exist and the Discuss page tab is separate; clicking the other project tab changes the page head to that project's name/repository and requests `local/issues` with `project=<id>` (assert the request path/query) and the other project's issues only.
     - overflow: stub layout (e.g. `Object.defineProperty` getters for `scrollWidth`/`clientWidth` on the project strip, restored after the test) so the strip overflows; with two projects assert the More button is absent, then set the stub to overflow and assert More appears; open it, assert the menu lists every project and the current one has `aria-checked="true"`, choose an off-strip project, assert it becomes the current project (`aria-selected`) and Discuss requests its issues. Cover the "all projects reachable with More, never overflow without More" criterion.
     - standalone creation: the New project button is in the project bar (`.dt-project-bar`), clicking opens the create view without the Discuss board/form/requirements; Cancel issues no POST; filling name/repository/worktreeRoot submits the expected body, then the new project appears as a current tab and Discuss returns to that project's list (request with the new project id); empty worktreeRoot is omitted.
   - Do not weaken existing assertions unrelated to this slice.
11. **Docs**
   - `docs/005-panel.md`: in Tabs, describe the project bar above the page tabs (one tab per local project, current selected, `More` when the strip overflows, top New project button opens a separate page, cancel/back creates nothing, creating returns to the new project's Discuss list). Update the Discuss row to the new behavior: scoped to the current project, shows its execution repository and optional worktree root, no inline project creation or filter links, and a create-first hint with no projects.
   - `docs/007-architecture.md`: update the `src/client/app.tsx`, `provider.tsx`, `discuss.tsx`, `route.ts` rows; add a row for `src/client/projects.tsx` (project bar with its overflow menu and the standalone create page); update/add the test table rows for `tests/panel-discuss.spec.tsx` and the new `tests/panel-projects.spec.tsx`. The `tests/docs.spec.ts` module/test table completeness checks must pass.
   - Do not edit `docs/issues/`, `docs/evidence/`, benchmarks, or the already-written slice issue.

## Do not

- Do not change `src/app/**`, the host API, the project schema, or `worktreeRoot` semantics.
- Do not add a new page tab, do not reorder pages, and do not render project tabs inside `main`.
- Do not create a second project store or duplicate the projects polling outside `PanelProvider`.
- Do not commit, push, or open a PR; do not capture screenshots.
- Do not edit `docs/005`/`007` beyond the two bullets above.

## Acceptance for this lane

1. Every frozen P1 criterion is implemented in code and covered by the tests above (excluding the screenshot/PR/docs-evidence parts the worker owns).
2. `pnpm typecheck` passes.
3. `pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-panel.spec.tsx tests/locales.spec.ts tests/docs.spec.ts` passes.
4. `pnpm build` passes.
5. `git diff --check` is clean.

## Verify (report the exact commands and summaries)

```
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-panel.spec.tsx tests/locales.spec.ts tests/docs.spec.ts
pnpm test
pnpm build
git diff --check
```

## Report

Report the files changed, a short design note for the overflow measurement and the jsdom stubbing used, the exact test/build command output summaries (files/tests passed), and any acceptance criterion you could not fully cover. Do not commit.
