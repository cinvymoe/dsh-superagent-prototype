---
issue: "d0dd937df77445f210774f42185c5f7b"
task: T1
lane: quick
affected_modules: ["src/client"]
arch_doc_required: none
executor_intent: "implementation + tests + evidence; native lane; T1"
dispatch:
  backend: native
  mode: 主会话原生 lane
  model: 继承
  reasoning_effort: medium
  complexity: T1
  executor_ref: ""
  decision_mode: auto
  autonomy_ref: "A1#s4-gate"
  owner_confirmed: "auto:A1#s4-gate 2026-11-11"
---

# Task-Contract · issue-d0dd937df77445f210774f42185c5f7b T1

## 目标

In the Execution ticket filter row, render a small outline Clear filters button (existing `Button` + `Icon`
`filter`) directly after the Pills only while the selected filter is not `open`; clicking it resets to the Open filter
exactly as the Open Pill does. Add the `clearFilters` locale key in Chinese and English, cover hidden/shown/reset in
`tests/panel-execution.spec.tsx`, and note the button in the Execution row of `docs/005-panel.md`.

## 涉及文件

- `src/client/execution.tsx` (the `ExecutionStatus` filter row)
- `src/client/locales.ts` (the `clearFilters` key in both dictionaries)
- `tests/panel-execution.spec.tsx` (hidden, shown, reset)
- `docs/005-panel.md` (Execution row description)

`tests/locales.spec.ts` must pass unchanged; do not add an assertion there.

## 架构影响

Module `src/client`; `arch_doc_required: none`. The change is a conditional control in one existing view plus one
locale pair; no route, API, data or module contract changes.

## 验收判据

- `pnpm vitest run tests/panel-execution.spec.tsx tests/locales.spec.ts` → the new assertions pass; locale parity
  reports the key present in both languages.
- `pnpm typecheck && pnpm test && pnpm build` → `pnpm check` exits 0.
- The rendered control is a `.dt-btn.dt-btn-outline.dt-btn-sm` inside `.dt-filters`, after the last `.dt-pill`, with
  the label 清除筛选 (zh) / Clear filters (en) and the existing `filter` SVG icon.

## TDD 要求

- 红: extend `tests/panel-execution.spec.tsx` first with hidden (Open), shown (Pending, and Ended after the existing
  click), and reset (click → `tickets?state=open&limit=20`, `aria-pressed` on the Open pill, control gone) cases;
  run the spec and capture the failure output.
- 绿: implement the conditional Button and locale key until the spec passes.
- 重构: keep the row consistent with the existing pill markup and formatting; rerun `pnpm check`.

## 避坑注入

- The filter click handlers already reset `limit` to 20 and use `replace: true`; the clear control must reuse that
  path, not add a new history entry or a new route field.
- `Button` defaults to `type="button"`; keep the control out of the keyboard tab order only if it is not rendered on
  Open — do not hide it with CSS or `hidden`.
- Both dictionaries are typed by `DshSuperagentKey`; add the key to `zh` and `en` together or typecheck fails.
- Match the existing test style (`mount`, `click`, `all`, `text`, `server.requests`), not a new harness.

## 测试环境

Not applicable: no real device. The UI evidence is a browser capture of the real DSH Web panel described below; the
implementation lane must run the unit specs only.

## 边界

- Do not touch the Trigger or Eval filter rows, `TICKET_FILTERS`, route parsing, or any API.
- Do not restyle the pill row or change its spacing beyond the new sibling control.
- Do not commit, push or open the PR; the parent handles the branch, review and PR.
- Do not restart or reconfigure the running DSH service at port 3083.

## 禁止事项

- No new component library, no new icon, no new CSS class unless the existing `.dt-filters` flex row genuinely cannot
  place the control (it can).
- No snapshot tests or implementation-detail selectors beyond the existing `.dt-filters` / `Button` classes.

## 回报格式

Complete: what changed (file:line), the red/green command outputs, `pnpm check` result, and the exact diff paths.
Blocked: the failing command and the concrete missing prerequisite.
