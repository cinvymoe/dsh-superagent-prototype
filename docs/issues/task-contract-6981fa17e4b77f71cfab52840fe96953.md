# Task contract · C4 · 面板需求详情执行模式开关

Ticket: `6981fa17e4b77f71cfab52840fe96953` (slice C4 of alignment `q-2f92c878`)
Worktree: `/data/project/workspace/dsh-worktrees/slice-6981fa17e4b7`
Baseline: branch `agent/slice-6981fa17e4b7`, which merged the unmerged C2 prerequisite
(`agent/slice-5e9fa76642ab`, C2 PR #20) at `bee00110`. C1 (`6ed5fded`) is already in `main`. So the tree already has
`LocalIssue.execution`, `requirementExecutionMode`, `POST local/issues/:id/execution` (route + `setExecution`),
`userError.executionMode` / `userError.executionLocked`, and the panel fake server's `dispatchedIssues` set with that
route. Do not re-implement any of C2.

## Goal

The Discuss panel lets a person choose, before confirming an alignment proposal, whether the requirement's slice
Tickets run natively or through the feature-exec execution flow. The choice lives in the detail's “对齐结果” card, is
saved immediately through `POST local/issues/:id/execution`, survives a refresh, becomes read-only with a Tag once the
requirement dispatched Tickets, and appears on every requirement list row (native when never chosen).

## Edits

1. `src/client/discuss.tsx`
   - Import `InfoTip` and `Switch` from `./controls.tsx` (keep the existing `Button`/`Icon`/`Tag` imports) and
     `requirementExecutionMode` from `../sources/local-format.ts`.
   - Add two small helpers next to `stateTag`/`statusTag`:
     - `const executionLabel = (t: T, issue: Pick<LocalIssue, 'execution'>) => t(mode === 'feature-exec' ? 'discuss.executionFeatureExec' : 'discuss.executionNative')` with `const mode = requirementExecutionMode(issue)`.
     - `const executionTag = (t: T, issue: LocalIssue) => <Tag tone={requirementExecutionMode(issue) === 'feature-exec' ? 'info' : 'neutral'}>{executionLabel(t, issue)}</Tag>`.
   - `RequirementList`: append `{executionTag(t, issue)}` to each row's `.dt-row-meta`, after `statusTag(t, issue)`.
     Default (no `execution`) must render the native label.
   - `RequirementDetail`:
     - `const dispatched = data!.thread.tickets.length > 0` (the detail already renders `data!.thread.tickets`).
     - Inside the `{alignment && <>…</>}` block, between the existing meta row (`<When …/>` / reason line) and the
       `.dt-actions` confirm/reject block, render exactly one of:
       - dispatched → `<div className="dt-row-meta">{executionTag(t, issue)}<span>{t('discuss.executionLocked')}</span></div>`
         (no Switch anywhere on the page for that requirement);
       - `alignment.status === 'proposed'` → `<div className="dt-switch-row">
         <span className="dt-field-head">{t('discuss.executionSwitch')}<InfoTip text={t('discuss.executionHint')} /></span>
         <Switch checked={requirementExecutionMode(issue) === 'feature-exec'} label={t('discuss.executionSwitch')}
           onChange={next => { void act(() => call('POST local/issues/:id/execution', { id, body: { mode: next ? 'feature-exec' : 'native' } })) }} />
         </div>`. Reuse the component's existing `act` wrapper so it disables while busy, reloads on success and shows
         the localized host refusal through `notify` on failure (no client-side optimistic flip).
       - other states → nothing extra (no control, no tag; the list row still shows the mode).
   - Keep the switch disabled while `busy` where the surrounding pattern does so (`<Switch>` has no `disabled` prop;
     instead render the `dt-switch-row` inside the same guarded act, which already ignores clicks while busy). Do not
     invent a new control or CSS class.

2. `src/client/locales.ts` — add next to the other `discuss.*` keys (zh first, en second):
   - `'discuss.executionSwitch': ['执行阶段使用 feature-exec', 'Run the execution stage with feature-exec']`
   - `'discuss.executionHint': ['开启后该需求派发的切片工单走 feature-exec 执行流程；关闭走原生执行。', 'On: its slice Tickets run the feature-exec execution flow. Off: they run natively.']`
   - `'discuss.executionNative': ['原生', 'Native']`
   - `'discuss.executionFeatureExec': ['feature-exec', 'feature-exec']`
   - `'discuss.executionLocked': ['已派发工单，执行方式固定。', 'Tickets are already dispatched, so the mode is fixed.']`
   - Do not touch `userError.executionMode` / `userError.executionLocked` (C2) or any other key.

3. `tests/panel-discuss.spec.tsx` — add three tests in the Discuss block (reuse the existing `PROJECT`, `localIssue`,
   `at`, `mount`, `remount`, `all`, `click`, `text` helpers):
   - **proposed alignment switch**: seed one issue whose `alignment.status` is `'proposed'` (a one-slice proposal is
     enough), open `{ page: 'requirements', id: 'q-fixture' }`. Assert the single `[role="switch"]` exists, its
     `aria-checked` is `'false'`, and the native label (`zh['discuss.executionNative']`) is visible. Click it; assert a
     `POST local/issues/q-fixture/execution` request with body `{ mode: 'feature-exec' }`; after settling the switch is
     `aria-checked="true"` and the feature-exec label is visible. Then `await remount()` (a refresh) and assert it is
     still on and still feature-exec.
   - **dispatched requirement is read-only**: seed an issue whose alignment is `'confirmed'` and add its id to
     `server.dispatchedIssues`; open its detail. Assert there is no `[role="switch"]`, a Tag shows the mode (native when
     `execution` is unset, feature-exec when set `'feature-exec'`), and the locked hint
     (`zh['discuss.executionLocked']`) is visible.
   - **list rows show the mode**: seed two issues, one with `execution: 'feature-exec'` and one without `execution`;
     open the requirement list and assert the first row's meta contains the feature-exec label and the second row's meta
     contains the native label.
   - Leave the existing tests untouched.

4. `tests/fixtures/panel-server.ts` — the fake server's local Thread page always has `tickets: []`, so the dispatched
   state is unreachable. Change `localThread` to take a second `dispatched` boolean (default `false`) and return one
   linked ticket (`tickets: [{ id: 'ticket-C1', title: 'C1 · dispatched slice', state: 'open' }]`) when it is true; at the
   `GET local/issues/:id` route pass `server.dispatchedIssues.has(issue.id)`. Do not change the
   `POST local/issues/:id/execution` route semantics C2 added, and keep `server.misuse` empty (the typed route contract
   already declares the body).

## Constraints

- Only the four files above; do not touch `src/app/*`, `src/core/*`, `src/sources/*`, `docs/005-panel.md` (C5), the
  product docs, or any other test.
- No new CSS; reuse `dt-switch-row`, `dt-field-head`, `dt-row-meta`, `dt-tag`.
- Both languages for every new key; no duplicated mode strings elsewhere in the client.
- Do not commit, push, open a PR, capture screenshots or write `docs/evidence/`; the worker owns delivery, review,
  evidence and the PR.
- Keep the change focused: no refactor of `RequirementDetail`, no optimistic UI, no extra controls for states the
  frozen acceptance does not name.

## Verification

- `pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts` — all green, with the three new tests.
- `pnpm typecheck` — exit 0.
- `git diff --check` — clean.
- Report back: files changed, the exact test titles added, command results (counts), and any deviation from this
  contract with its reason.
