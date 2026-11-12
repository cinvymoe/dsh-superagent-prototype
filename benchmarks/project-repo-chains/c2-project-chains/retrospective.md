# Retrospective

## What went well

- The lane delivered the model/API/runtime/panel/test skeleton in one pass; the worker only had to fix two edge cases and finish documents. The contract's fixed design decisions (chain id = project id, `Settings.save` as the probe gate, project-record write before chain save with cleanup) kept the implementation small.
- Behavioral HTTP tests covered all six frozen criteria, including the negative paths (unreadable, unpushable, duplicate name, bad format) and deep equality of untouched chain rows.

## Pitfalls and fixes

- **Legacy project PUT dropped root validation.** The first implementation validated only the stored root in the legacy branch and then wrote the raw `worktreeRoot`, so a relative root could bypass validation; it also stored `''` when clearing. Fix: include the incoming root in `validateProject`'s input and pass only its normalized output to `patchProject`.
- **Defensive startup binding.** `bindLegacy` originally parsed the stored GitHub configuration with `GithubConfigSchema.parse`; a damaged stored configuration would crash startup before setup could report a problem. Fix: `safeParse` and treat an unparseable configuration as no chains.
- **`docs/007` module table** is checked by `tests/docs.spec.ts`; a new `src/app/projects.ts` must be listed or `pnpm check` fails at the test stage. Likewise the two project-documentation phrase assertions need updating when the UI wording changes.
- **Test flake from concurrency.** Running the full suite while another vitest suite is active made `tests/tools.spec.ts` exceed its 5000 ms limit once. Run `pnpm check` alone; the isolated run is green.
- **Capture profile session collision.** Copying an existing profile/database reuses `master-id`; two servers then fight over the same DSH Session. Give each capture profile a distinct JSON-encoded `master-id` in its SQLite and use separate state dirs/ports.
