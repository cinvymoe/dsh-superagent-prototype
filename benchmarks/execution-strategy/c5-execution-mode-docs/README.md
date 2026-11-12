# C5 regression case: execution-mode switch and policy-version decoupling docs

Regression case for the product documentation of the requirement execution-mode switch (`native` default, `feature-exec` on request) delivered by slice C5 of Discuss alignment `q-2f92c878`.

- Ticket: `8542a15caed33431e8d96ea21055ee11`, run `run-mwdral57-14` (execute, A1)
- Branch: `agent/slice-8542a15caed3`; PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/29 (open; a person reviews and merges)
- Base: deployment `main` @ `40191e32`; the branch later merged `main` @ `934a1f07`, which carries C3 (#19), C4 (#25), M1 (#24), the requirement filter (#22), #26 and linked-Ticket sessions (#23)
- Scope: docs only — `docs/002-authorization.md`, `docs/003-execution.md`, `docs/005-panel.md`, `docs/007-architecture.md`, plus the slice record, review and evidence. No `src/`, `tests/`, `prompts/` or configuration change.

## What the docs must state

1. `native` is the default for a requirement that made no choice, and a legacy requirement record without `execution` dispatches native.
2. The requirement detail's alignment-card switch runs `feature-exec` when on and `native` when off; it starts off.
3. The execution mode is not part of the Policy version; changing it is not a Policy version change and a Policy change never moves a Ticket between modes.
4. At dispatch each slice Ticket pins `plan.execution = { mode, version }` with `execution-v1`; later default or contract changes never rewrite a dispatched Ticket.
5. A host without the feature-exec service runs a feature-exec Ticket natively; an unknown contract version falls back to the current registry.
6. Once slice Tickets exist, the mode is fixed: read-only tag plus locked hint, and `executionLocked` from the update route.
7. A legacy Ticket without `plan.execution` resolves as `feature-exec`, the opposite direction from a legacy requirement record.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `docs/issues/review-C5-execution-mode-docs.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Targeted docs log | `docs/issues/evidence/c5-execution-mode-docs-targeted.log` |
| Related regression log | `docs/issues/evidence/c5-execution-mode-docs-regression.log` |
| Full verification log | `docs/issues/evidence/c5-execution-mode-docs-check.log` |

## How to re-run

```sh
pnpm vitest run tests/docs.spec.ts
pnpm vitest run tests/docs.spec.ts tests/local.spec.ts tests/local-align.spec.ts tests/panel-discuss.spec.tsx tests/prompts.spec.ts tests/locales.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected on the merged branch: docs spec 1 file / 16 tests; the related set 6 files / 108 tests; full check 64 files / 1321 tests plus a complete build; `git diff --check` silent.

## Visual evidence

None: the slice renders no UI and changes no code. The switch itself shipped with C4 and carries its own Before/After captures (`docs/evidence/c4-execution-mode/`).

## Merge note

C3 and C4 merged into `main` while this slice was running (`934a1f07`), so the docs describe code present in the tree. The branch merged that `main`; the only conflicts were the `docs/005` Requirements row and the `docs/007` `discuss.tsx` and test rows, resolved by keeping the execution-mode additions together with the incoming filter, newest-first timeline, Open Session and C3/C4 table rows.
