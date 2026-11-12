# Task contract · C1 · Split the New requirement and Requirements tabs, simplify the submit page

Ticket: `de236aab51cc140a2178fc3fe96f2d3c` (slice C1 of alignment `q-612052e8`)
Worktree: `/data/project/workspace/dsh-worktrees/slice-de236aab51cc`
Branch: `agent/slice-de236aab51cc`, based on deployment `main` @ `04cb0449` (already applied).

## Goal

Deliver the frozen C1 slice: the panel page tabs become **Overview**, **New requirement**, **Requirements**, **Source**, **Trigger**, **Eval**, **Execution**, **Settings** (in that order, no **Discuss** tab). The New requirement tab shows only the current project's project head (name, execution repository, optional `worktreeRoot`) and a single description field — no title input, no requirement list, no "Overview" back button. The Requirements tab lists the current project's requirements newest first, each row with state/alignment tags, time and slice count, and opening a row shows the requirement detail whose back control returns to the requirement list. Submitting derives the requirement title from the first non-empty line of the description (whitespace collapsed, truncated to 200), stores the full description as the body, and no longer repeats the full text in the detail page or the thread record. Project switching keeps the current tab when on New requirement or the requirement list, otherwise lands on the requirement list; creating a project lands on the new project's requirement list. Old saved routes `page=discuss` (with `id` or `create`) open the corresponding new page.

Read first: `docs/issues/de236aab51cc140a2178fc3fe96f2d3c.md` (frozen acceptance criteria), `src/client/app.tsx`, `src/client/discuss.tsx`, `src/client/projects.tsx`, `src/client/route.ts`, `src/client/widgets.tsx`, `src/client/locales.ts`, `src/client/provider.tsx`, `src/app/local.ts`, `src/app/http.ts`, `src/app/api.ts`, `src/sources/local-format.ts`, `tests/panel-discuss.spec.tsx`, `tests/panel-projects.spec.tsx`, `tests/panel-overview.spec.tsx`, `tests/panel-panel.spec.tsx`, `tests/navigation.spec.ts`, `tests/local.spec.ts`, `tests/fixtures/panel-server.ts`, `tests/fixtures/panel.tsx`, `docs/005-panel.md`, `docs/007-architecture.md`.

## Fixed design decisions (do not redesign)

1. **Tabs and routes** (`src/client/route.ts`)
   - `TABS = ['overview', 'newRequirement', 'requirements', 'source', 'trigger', 'eval', 'execution', 'settings']`.
   - `Route` replaces the `discuss` variants with:
     `| { page: 'newRequirement'; id?: undefined; query?: undefined }`
     `| { page: 'requirements'; id?: undefined; create?: true; query?: undefined }`
     `| { page: 'requirements'; id: string; query?: undefined }`
   - `parseRoute`:
     - `'newRequirement'` → `{ page: 'newRequirement' }` (ignore any id/create/query).
     - `'requirements'` → record ? `{ page: 'requirements', id: record }` : `create === true ? { page: 'requirements', create: true } : { page: 'requirements' }`.
     - Legacy `'discuss'` → record ? `{ page: 'requirements', id: record }` : `create === true ? { page: 'requirements', create: true } : { page: 'requirements' }`. The legacy tab disappears without a white screen.
   - `routeLabel`: `create` → `t('discuss.newProject')`; an id → `t('term.issue')` on requirements (keep `term.thread` / `term.ticket` for the other pages); otherwise `t(`tab.${route.page}`)`.
2. **Page head** (`src/client/widgets.tsx`)
   - `PageHead` gains an optional `back` prop: `back?: false | { label: string; onClick: () => void }`. Default (undefined) keeps the current context `back`/`backLabel` behaviour; `false` renders no back button; an object renders that button.
3. **Pages** (`src/client/app.tsx`)
   - `case 'newRequirement': return <NewRequirementPage />`.
   - `case 'requirements': return route.id !== undefined ? <RequirementDetail key={route.id} id={route.id} /> : route.create ? <NewProjectPage /> : <RequirementList />`.
4. **Requirement pages** (`src/client/discuss.tsx`; keep the file name and the `discuss.*` locale namespace)
   - `NewRequirementPage`: `active = projects.find(item => item.id === project) ?? projects[0]`; page head (no back button) title is `active.name` (fallback `t('discuss.new')`), children: `t('discuss.newSubtitle')`, `active.repository` and `active.worktreeRoot` in `dt-mono` spans. With no project, show only the `t('discuss.noProjects')` hint. With a project, show one form card: card title `t('discuss.new')`, a project `Tag`, and a single `<textarea>` bound to the description (maxLength 20000, `placeholder`/`aria-label` from `t('discuss.descriptionPlaceholder')`), a hint `t('discuss.descriptionHint')`, and a submit button `t('discuss.submit')` disabled while `busy || !description.trim() || !active`.
   - Submit: `POST local/issues` with `{ body: { body: description.trim(), project: active.id } }` — no `title` field. On success clear the description and `navigate({ page: 'requirements', id: issue.id })`. On failure `notify(errorText(failure))`.
   - `RequirementList`: same `active` resolution; page head (no back button) title is `active.name` (fallback `t('discuss.requirements')`), children: `t('discuss.listSubtitle')`, repository and worktree root. With no project show the `t('discuss.noProjects')` hint. Otherwise `Section title={t('discuss.requirements')} count={issues.length}` with rows newest-first from `GET local/issues?project=<active.id>`; empty hint `t('discuss.empty')`; each row shows `stateTag`, `statusTag`, `<When at={issue.createdAt} />` and `t('discuss.slicesCount', { count: issue.alignment?.slices.length ?? 0 })`; the row title button navigates to `{ page: 'requirements', id: issue.id }`.
   - Requirement detail: keep the current sections (requirement, alignment, timeline, tickets, decisions, close action), but:
     - page head back button is explicit: `back={{ label: t('discuss.back'), onClick: () => navigate({ page: 'requirements' }, true) }}` (returns to the requirement list, never Overview);
     - the requirement card shows `issue.body` once (keep `t('discuss.noBody')` when empty);
     - the discussion timeline must not repeat the original requirement message: drop the timeline trigger whose `text` equals `issue.body || issue.title` (the earliest such trigger) from the rendered events. Add a comment that the requirement is shown above, so the full text appears once on the page.
     - remove the duplicated bottom `t('discuss.back')` button; keep Close.
   - Delete the old `DiscussBoard` component.
5. **Title derivation** (`src/app/local.ts`, `src/app/http.ts`, `src/app/api.ts`)
   - Export `requirementTitle(text: string): string` from `src/app/local.ts`: first non-empty line, `trim()`, collapse every whitespace run to one space, truncate to 200 chars.
   - `LocalIssueInput.title` becomes optional (`title?: string`); `LocalIssues.create` computes `description = (input.body ?? '').trim()`, `title = input.title?.trim() || requirementTitle(description)`; if both are empty throw `UserError('issueEmpty')`. Store `title` (derived or explicit) and `body: description`.
   - The original Trigger text: `!description ? title : input.title?.trim() ? `${title}\n\n${description}` : description`. When the title is derived from the description, the full description appears exactly once in the thread record (no title prefix duplication).
   - `src/core/errors.ts`: add `issueEmpty: ['refused', 'A requirement needs a description']` to `USER_ERRORS`; `src/client/locales.ts`: add `userError.issueEmpty` in both languages.
   - `src/app/http.ts` `POST local/issues` schema: `title: z.string().trim().min(1).max(200).optional()`, `body: z.string().trim().max(20_000).optional()`, `project: z.string().min(1)`; `create` enforces non-empty.
   - `src/app/api.ts` body type: `{ title?: string; body?: string; project: string }`.
6. **Project bar** (`src/client/projects.tsx`)
   - `select(id)`: `setProject(id)`; if the current route is `newRequirement`, navigate `{ page: 'newRequirement' }` with replace; else if the current route is `requirements` without `id` and without `create`, navigate `{ page: 'requirements' }` with replace; otherwise navigate `{ page: 'requirements' }` (push). This keeps the current tab on the two requirement tabs and makes every other tab land on the requirement list.
   - New-project button navigates `{ page: 'requirements', create: true }` (replace when already on that page).
   - `NewProjectPage`: on success `await reloadProjects(); setProject(project.id); navigate({ page: 'requirements' }, true)`; Cancel and the page-head back both return to `{ page: 'requirements' }` with replace and create nothing.
7. **Locales** (`src/client/locales.ts`)
   - Remove `tab.discuss`, `discuss.title`, `discuss.subtitle`, `discuss.titlePlaceholder`, `discuss.bodyPlaceholder` (no dead copy for the old design).
   - Add `tab.newRequirement: ['新建需求', 'New requirement']`, `tab.requirements: ['需求列表', 'Requirements']`, `discuss.newSubtitle: ['提交一条需求，首行会成为需求标题。', 'Submit a requirement; its first line becomes the title.']`, `discuss.listSubtitle: ['审阅对齐结果，确认或打回。', 'Review the alignment before it is accepted.']`, `discuss.descriptionPlaceholder: ['描述要做什么，首行会成为需求标题', 'Describe what to do; the first line becomes the title']`, `discuss.descriptionHint: ['正文会完整保存；标题由首个非空行生成，超长会自动截断。', 'The full description is saved; the title comes from its first non-empty line and is shortened when long.']`.
   - Change `discuss.empty` to `['还没有需求。在「新建需求」里提交第一条。', 'No requirements yet. Submit the first one under New requirement.']`.
   - Change `discuss.timeline` to `['消息记录', 'Messages']` so no page copy says 讨论. Check the whole locale file for any remaining 讨论/Discuss copy that can render on the panel.
8. **Tests**
   - `tests/fixtures/panel-server.ts`: `POST local/issues` accepts `{ title?, body?, project }` and mirrors the host's title derivation (first non-empty line, collapsed, 200 max) when `title` is absent; keep `server.misuse` empty. `localThread(issue)` should include the issue's original trigger in `timeline` (id `local-<issue.id>`, text = issue.body || issue.title, actor local, at createdAt) so the detail's de-duplication is testable.
   - `tests/panel-discuss.spec.tsx`: cover the new requirement page (no title input; submit disabled with empty description; submit posts `{ body, project }`; detail shows the derived title and the full description once and the timeline does not repeat it); the requirement list (newest first, tags/time/slice count, row opens detail); the detail back button returns to the requirement list; no `概览` back button on New requirement; no requirement list on New requirement.
   - `tests/panel-projects.spec.tsx`: project switching on New requirement stays there and the form targets the new project; switching on the requirement list stays there and refetches; switching from Overview lands on Requirements; creating a project lands on its Requirements list; update all uses of `zh['tab.discuss']` and old routes.
   - `tests/panel-overview.spec.tsx` and `tests/panel-panel.spec.tsx`: page-tab label arrays become the 8 new labels.
   - `tests/navigation.spec.ts`: `parseRoute` covers `newRequirement`/`requirements` and the legacy `discuss` mappings; keep the removed-tab fallback test.
   - `tests/local.spec.ts`: `requirementTitle` unit cases (blank lines, collapsed whitespace, 200-char truncation) and `create` deriving the title and the trigger text from a description-only input; keep the explicit title+body case unchanged.
   - Do not weaken existing assertions unrelated to this slice.
9. **Docs**
   - `docs/005-panel.md`: Tabs line becomes **Overview**, **New requirement**, **Requirements**, **Source**, **Trigger**, **Eval**, **Execution**, **Settings**. Replace the Discuss row with New requirement and Requirements rows (keep the exact phrase `an optional absolute `worktreeRoot` (empty keeps the Execution ticket directory root)` somewhere in the New requirement row so `tests/docs.spec.ts` keeps passing). Update the Sources bullet that says "the local source backs the Discuss board". Describe the single description field, the first-line title and the requirement list/detail behaviour.
   - `docs/007-architecture.md`: update the `src/client/app.tsx`, `discuss.tsx`, `route.ts`, `projects.tsx` rows and the `tests/panel-discuss.spec.tsx` / `tests/panel-projects.spec.tsx` rows to the new behaviour. `tests/docs.spec.ts` module/test table completeness must pass.
   - Do not edit `docs/issues/`, `docs/evidence/`, benchmarks, or the already-written slice issue.

## Do not

- Do not add image attachments (a different slice).
- Do not change `src/app/**` beyond the title-derivation/HTTP-contract change above.
- Do not add another project store or move projects polling out of `PanelProvider`.
- Do not commit, push, open a PR, or capture screenshots; the worker reviews, runs the full gate, captures evidence and opens the PR.

## Acceptance for this lane

1. Every frozen C1 criterion is implemented in code and covered by the tests above (excluding the screenshot/PR/docs-evidence parts the worker owns).
2. `pnpm typecheck` passes.
3. `pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-overview.spec.tsx tests/panel-panel.spec.tsx tests/navigation.spec.ts tests/local.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts` passes.
4. `pnpm build` passes.
5. `git diff --check` is clean.

## Verify (report the exact commands and summaries)

```
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-overview.spec.tsx tests/panel-panel.spec.tsx tests/navigation.spec.ts tests/local.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts
pnpm test
pnpm build
git diff --check
```

## Report

Report the files changed, the key design notes (route migration, title derivation, detail de-duplication), the exact test/build command output summaries (files/tests passed), and any acceptance criterion you could not fully cover. Do not commit.
