# C4 regression case: the panel chooses a requirement's execution mode

- Ticket: `6981fa17e4b77f71cfab52840fe96953` (slice C4 of alignment `q-2f92c878`「执行阶段 feature-exec / 原生开关，默认原生」)
- Branch: `agent/slice-6981fa17e4b7`
- Base: `40191e32` (deployment `main`, C1 `a6e2430d` + C2 #20 already merged); branch head `18a3f8b1`
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/25 (open; a person reviews and merges)
- Scope: the Discuss panel only — the requirement detail's alignment card offers the execution-stage switch while the proposal waits for confirmation, saves through C2's `POST local/issues/:id/execution`, shows the fixed mode as a read-only Tag once Tickets exist, and every requirement list row shows the mode (`native` when never chosen). Requirement storage/API (C2), strategy resolution (C3) and product docs (C5) are other slices.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `docs/issues/review-C4-execution-mode.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Targeted verification log | `docs/issues/evidence/c4-execution-mode-targeted.log` |
| Typecheck log | `docs/issues/evidence/c4-execution-mode-typecheck.log` |
| Full verification log | `docs/issues/evidence/c4-execution-mode-check.log` |
| Diff hygiene log | `docs/issues/evidence/c4-execution-mode-diffcheck.log` |

## How to re-run

```sh
pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: targeted 2 files / 29 tests (panel 23 + locales 6); typecheck clean; full suite 63 files / 1298 tests plus a complete build; no diff-check output.

## Visual evidence

`docs/evidence/c4-execution-mode/` carries same-scenario before/after captures of the requirement pages at a 1440×1100 viewport, light theme, zh-CN:

- Before: `before-detail-proposed.png`, `before-detail-feature-exec.png`, `before-detail-dispatched.png`, `before-list.png` — commit `bee00110` (C1 + C2, no C4).
- After: the matching `after-*.png` from branch head `18a3f8b1`, plus `after-detail-enabled.png` (switch saved on) and `after-list-persisted.png` (a full page reload reads the stored mode back).
