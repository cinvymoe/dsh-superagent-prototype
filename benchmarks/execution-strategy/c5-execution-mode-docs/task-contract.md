# Task contract (lane-T1-1)

Deliver the frozen docs slice in the ticket worktree; do not commit, push or open a PR.

## Goal

Record the requirement execution-mode switch and its decoupling from the Policy version in the product docs, matching the merged C1–C4 behavior.

## Allowed files

- `docs/003-execution.md` — new `## Execution strategy` section with all seven frozen semantics.
- `docs/002-authorization.md` — one paragraph: the execution strategy is outside the Policy version (no link to 003, because numbered docs link only to earlier ones).
- `docs/005-panel.md` — the alignment-card switch, list-row mode, post-dispatch read-only tag; no global default in Execution settings.
- `docs/007-architecture.md` — Model, Sessions, Executor tools and Plan slices narrative; descriptions for `local.ts`, `local-format.ts`, `discuss.tsx`, `local.spec` and `local-align.spec`. No new table rows for files absent from the worktree.
- `docs/issues/8542a15caed33431e8d96ea21055ee11.md` is captain-owned; do not edit it.

## Forbidden

`src/`, `tests/`, `prompts/`, `package.json`, new numbered documents, merge-conflict markers, links from a numbered doc to a later one, and module/test rows for files that do not exist.

## Required semantics

See `requirement.md`; all seven must be explicit in `docs/003`, with the Panel surface in `005`, the Policy exclusion in `002`, and the implementation index in `007`. Keep the legacy directions distinct: a legacy requirement record is native, a legacy Ticket is feature-exec.

## Verification and report

Run `pnpm vitest run tests/docs.spec.ts` and `git diff --check`. Report the files changed, the heading and first sentence of the new 003 section, a quotation for each of the seven semantics, both command results, and any inconsistency noticed.
