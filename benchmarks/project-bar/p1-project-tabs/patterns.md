# Reusable patterns · P1

## Project tab strip with an always-reachable overflow menu

- Keep the current project in the panel's route memory (`Location.project`), not in component state, so page-tab navigation, reload and the page head agree.
- Put the project tablist above the page tablist as a separate `role=tablist`; use chips for projects and the existing segmented style for pages. The current tab is `aria-selected` and the only tab with `tabIndex=0`; arrow keys select the next/previous project.
- Measure overflow with `scrollWidth > clientWidth + 1` in an effect, re-run it on project/current/copy changes and through a `ResizeObserver` on the strip and its tabs. Render `More` only when that flag is true; the menu lists every project as `menuitemradio` with `aria-checked` on the current one, so an overflowed strip can never leave a project unreachable.
- Scroll the selected chip into view with optional-chained `scrollIntoView?.` so jsdom and older environments stay safe.
- Test overflow in jsdom by stubbing the strip's `scrollWidth`/`clientWidth` getters on the element, triggering a re-measure, and restoring the properties in `finally`; assert both the absent state (no overflow) and the present state.

## Standalone create route that returns to its subject

- Model the create screen as a sub-view of the owning page (`{ page: 'discuss', create: true }`) rather than a new page tab: the owning page tab stays selected and the page tablist keyboard model stays valid.
- Submit, Cancel and scope-changing project switches inside the owning page use `navigate(..., replace = true)`, so the stale create screen never becomes the back target.
- After a successful create: `await reloadProjects()`, set the created record as current, then return to the owning page's list. The fake API should return a unique id per created record so repeated creates can be asserted.
- Cover both "Cancel/Back creates nothing" (no POST) and "success makes it current and returns to the list" (selected tab, page head, scoped request).

## Topic-scoped board

- Fetch the board's records from the existing topic query (`GET local/issues?project=`) instead of fetching all and filtering in the client; include the topic id in the polling dependencies so a switch cannot reuse the previous response.
- Show the topic's identity facts (here execution repository and optional worktree root) in the page head, and repeat the target in the composer head so the submission target is visible without a select.
- With no topic, render only the create-first hint and keep the top-level create entry available; do not render a composer that cannot submit.
