# C5 two-axis review — execution-mode docs

- Slice: `C5` of alignment `q-2f92c878`（docs-only）
- Worktree: `slice-8542a15caed3`；reviewed baseline `40191e32` (deployment `main`, C1 + C2 merged)
- Review scope: `docs/002-authorization.md`, `docs/003-execution.md`, `docs/005-panel.md`, `docs/007-architecture.md`, the slice record and its evidence logs
- Review mode: captain self-review after lane `lane-T1-1`; the lane reported the docs and the captain verified and corrected the findings below
- Dependency note: the documented behavior comes from the frozen plan and the C3/C4 implementations (PR #19, PR #25), which are still open. This slice changes no code, and its PR must merge after #19 and #25.

## Standards

| Item | Verdict | Evidence |
| --- | --- | --- |
| Docs-only, no implementation change | PASS | `git diff --stat`: 4 docs files, 0 `src/`/`tests/`/`prompts/` changes; `git status` shows only the four docs plus the new slice record |
| Documentation voice and terminology | PASS | Technical English sentence case, consistent terms `native`, `feature-exec`, `execution-v1`, `plan.execution`, Policy version, `executionLocked` |
| Numbering and link direction | PASS | No numbered document added; `002` has no link to `003`; `003` links `001`/`002`; `005`/`007` link only earlier documents; `tests/docs.spec.ts` numbers/links tests pass |
| 007 Modules/Tests tables complete and only existing files | PASS | No row added or removed; existing rows for `src/app/local.ts`, `src/sources/local-format.ts`, `src/client/discuss.tsx`, `tests/local.spec.ts`, `tests/local-align.spec.ts` only had their descriptions extended; `tests/docs.spec.ts` table tests pass |
| No invented UI or API | PASS | Labels and hints copied from `src/client/locales.ts` (`discuss.executionSwitch`, `discuss.executionHint`, `discuss.executionLocked`, `discuss.executionNative`); the switch condition matches C4 (`alignment.status === 'proposed'` and no dispatched Ticket) |
| One place per concept | PASS | The policy-version exclusion lives in `002` and the execution semantics in `003`; `005` covers only the panel surface; `007` indexes the implementation |
| C3/C4 dependency disclosed | PASS | The slice record, this review and the PR describe the merge order; no table row pretends the C3 files exist in this worktree |

### Findings and fixes

- **F-1 (fixed): `007` still described the execute handoff as unconditional.** The prompts paragraph said `prompts/execute.md` is appended to a slice worker's prompt and `composeExecute` adds "the execution-only handoff", which the C3 seam makes true only for `feature-exec`. Rewritten to name the per-mode handoff and to state that no handoff is an overridable built-in part.
- **F-2 (fixed): `003` said dispatch "reads" the pinned strategy.** Dispatch writes `plan.execution`; launch resolves it. Rewritten to "At launch the worker follows the pinned strategy rather than choosing the mode again."
- **F-3 (fixed): `005` called the alignment proposal read-only while its card now carries a switch.** Clarified that the proposal's summary, slices and acceptance are read-only, and that its card carries the switch before dispatch and the fixed mode afterwards.
- **F-4 (fixed): the rewritten `007` Executor-tools paragraph made the `feature-exec` execute flow sound universal.** It now separates the `pr-opened` gate (`feature-exec`) from the report path (`native`) before the shared open-PR delivery sentence.
- **F-5 (limitation, not a defect): `007` cannot yet list `src/app/execution-strategy.ts` or `tests/execution-strategy.spec.ts`.** Those files live on the C3 branch, not in this worktree. Adding their rows here would fail the `docs.spec.ts` "only files that exist" assertion. C3's own PR adds them; this PR must merge after #19. Recorded in the slice issue and the PR description.

## Spec

The frozen acceptance has two parts: `tests/docs.spec.ts` passes, and the docs explicitly state seven semantics.

| # | Semantic | Verdict | Where |
| --- | --- | --- | --- |
| 0 | `pnpm vitest run tests/docs.spec.ts` passes | PASS | 14/14 tests passed (`docs/issues/evidence/c5-execution-mode-docs-targeted.log`) |
| 1 | Default native | PASS | `003` l.96: "`native` is the default. A requirement that made no explicit choice runs `native`, and a stored requirement record without `execution` dispatches `native` too"; `005` l.40: "It is off by default, which is `native`"; list row "Native" |
| 2 | Switch on runs feature-exec | PASS | `003` l.96: "off is `native`, on is `feature-exec`"; `005` l.40: "turning it on selects `feature-exec`"; UI label from `discuss.executionSwitch` |
| 3 | Execution mode not part of the Policy version | PASS | `003` l.102: "The execution mode is not part of the Policy version... changing a requirement's mode creates no Policy version change, and a Policy change never moves a Ticket between modes"; mirrored at `002` l.111 |
| 4 | `execution-v1` pinned with the Ticket | PASS | `003` l.100: "each slice Ticket pins `plan.execution = { mode, version }`... `execution-v1` is the current one. A later change of the default or of the contract never rewrites a dispatched Ticket"; `007` Model and Plan slices rows |
| 5 | Degrade to native without the feature-exec service | PASS | `003` l.106: "A host that did not register the feature-exec service runs a `feature-exec` Ticket as `native`: no `feature_exec_*` tools, no pre-run guard and the native handoff"; `007` Sessions paragraph |
| 6 | Immutable after dispatch | PASS | `003` l.104: "The mode is fixed after dispatch... read-only tag... `POST local/issues/:id/execution` refuses with `executionLocked`, leaving the record and its Tickets unchanged"; `005` l.44 |
| 7 | Legacy Tickets without the field resolve as feature-exec | PASS | `003` l.108: "A Ticket dispatched before `plan.execution` existed carries no such field and resolves as `feature-exec`, so an upgrade changes neither running nor resumable Tickets"; `007` Model paragraph |

The opposite directions stay distinct as required by the avoidance list: a legacy **requirement record** without `execution` dispatches `native` (`003` l.96/l.108), while a legacy **Ticket** without `plan.execution` resolves as `feature-exec` (l.108).

## Verification summary

- `pnpm vitest run tests/docs.spec.ts` → 14/14 passed (`docs/issues/evidence/c5-execution-mode-docs-targeted.log`)
- `pnpm vitest run tests/docs.spec.ts tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts` → 4 files / 57 tests passed (`docs/issues/evidence/c5-execution-mode-docs-regression.log`)
- `git diff --check` → no output
- Full `pnpm check` → see `docs/issues/evidence/c5-execution-mode-docs-check.log` (run before opening the PR)

## Verdict

Standards **APPROVE** and Spec **APPROVE**, with the C3/C4 merge-order limitation recorded. No blocking finding.
