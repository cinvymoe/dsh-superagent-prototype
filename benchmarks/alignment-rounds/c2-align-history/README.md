# C2 regression case: alignment round history in the panel

Regression case for the requirement pages delivered by slice C2 of Discuss alignment `q-29218185`
(「需求列表 讨论 支持 对齐历史 记录」): the list row's alignment round count and the detail's per-round history.

- Ticket: `9475bcf31c6087ebf919ad094091ef2b`, run `run-mwdss6mm-2` (execute, A1)
- Branch: `agent/slice-9475bcf31c60`; stacks on C1 (`agent/slice-9e69570faa5d` @ `6dc5144b`), deployment `main` @ `422a21a4` merged
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/35 (open; merge #30 first, then this PR; a person reviews and merges)
- Scope: panel read side only — list-round count, current-round expansion, collapsed/expandable earlier rounds, rejection reason and decisive time, `roundId` on the decision, bilingual keys, panel fixture parity and docs.

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Task contract (lane) | `task-contract.md` |
| Two-axis review and evidence | `docs/issues/review-C2-align-history.md` |
| Test environment prerequisites | `environment.md` |
| Reusable patterns | `patterns.md` |
| Retrospective | `retrospective.md` |
| Attempt log | `attempt-log.md` |
| Targeted verification log | `docs/issues/evidence/c2-align-history-targeted.log` |
| Typecheck log | `docs/issues/evidence/c2-align-history-typecheck.log` |
| Full check | `docs/issues/evidence/c2-align-history-check.log` |
| Before/After captures | `docs/evidence/c2-align-history/` |

## How to re-run

```sh
pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts tests/local.spec.ts tests/local-align.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected at the time of delivery: targeted 5 files / 106 tests; full suite 65 files / 1356 tests plus a complete build; typecheck exit 0; `git diff --check` silent. Test counts drift as `main` grows — judge by zero failures, not the exact totals.

## Visual evidence

Same seeded isolated SQLite state (project `Widgets`; one requirement with two rounds whose first was sent back, one single confirmed round, one unaligned), viewport 1440×1100, light theme, zh-CN. Before = C1 `6dc5144b`; After = `5d5da513`. See the PR description for the labelled table.

## What must not regress

- The current (last) round is the only expanded one; earlier rounds stay collapsed until opened.
- A collapsed earlier round shows its status, its decisive time and its rejection reason; opening it shows that round's summary, slices and acceptance criteria.
- Confirm/Send back exist only on a `proposed` current round and post its `roundId`; no decision control exists in the history area.
- A requirement without alignment shows no round count; a legacy single-`alignment` record reads as one round.
- English renders the same round history (`Current round`, `Round {n}`, `Earlier rounds`, `Reason`).
