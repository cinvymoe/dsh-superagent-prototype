# C1 regression case: alignment rounds and rejection feedback (host side)

Regression case for the local requirement alignment rounds delivered by slice C1 of Discuss alignment `q-29218185` (「需求列表 讨论 支持 对齐历史 记录」).

- Ticket: `9e69570faa5da701611f346b4232b0f1`, run `run-mwdqudkt-11` (execute, A1)
- Branch: `agent/slice-9e69570faa5d`; base = deployment `main` `40191e32`, merged up to `32262807` and then `934a1f07` before the PR
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/30 (open; a person reviews and merges)
- Scope: host-side alignment history only — `LocalAlignment.roundId`, `superseded`, `LocalIssue.alignments`, `propose`/`decide` semantics, the rejection feedback Trigger, current-round dispatch, the `roundId` HTTP contract and the two bilingual error codes. A history UI is a later slice.

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Task contract (lane) | `task-contract.md` |
| Two-axis review and evidence | `docs/issues/review-C1-align-rounds.md` |
| Test environment prerequisites | `environment.md` |
| Reusable patterns | `patterns.md` |
| Retrospective | `retrospective.md` |
| Attempt log | `attempt-log.md` |
| Typecheck log | `docs/issues/evidence/c1-align-rounds-typecheck.log` |
| Targeted verification log | `docs/issues/evidence/c1-align-rounds-targeted.log` |
| Full check before the main merge | `docs/issues/evidence/c1-align-rounds-check-retry.log` |
| Post-merge targeted log | `docs/issues/evidence/c1-align-rounds-merge-targeted.log` |
| Full check after the final main merge | `docs/issues/evidence/c1-align-rounds-check-postmerge2.log` |

## How to re-run

```sh
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/http.spec.ts tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected at the time of delivery: targeted 3 files / 50 tests; related 3 files / 38 tests; full suite 64 files / 1328 tests plus a complete build; typecheck exit 0; `git diff --check` silent. Test counts drift as `main` grows — judge by zero failures, not the exact totals.

## Visual evidence

None: this slice changes record/HTTP/dispatch semantics and the panel only sends the round it rendered; it renders no new UI. A history list, if any, belongs to a later slice and carries its own Before/After captures.
