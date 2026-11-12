# M1 regression case: requirement messages newest first, reply box above the list

- Ticket: `b92376fc87045bdd661562973b8aff37` (slice M1 of alignment `q-627a7e26`)
- Branch: `agent/slice-b92376fc8704`
- Base: `6ed5fded` (deployment `main`)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/24 (state OPEN; a person merges)
- Scope: the requirement detail lists its message timeline newest first and puts the follow-up box above the list; submitting shows the new message first, grows the count and clears the box; the original description still renders once and never inside the timeline; agent replies keep their 智能体 label; zh/en render without unresolved keys.

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Task contract | `task-contract.md` |
| Two-axis review and criteria evidence | `review.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Full gate log | `evidence/m1-timeline-check.log` |
| Targeted log | `evidence/m1-timeline-targeted.log` |
| Red run (old implementation) | `evidence/m1-timeline-red.log` |
| Typecheck log | `evidence/m1-timeline-typecheck.log` |

## How to re-run

```sh
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/docs.spec.ts tests/styles.spec.ts tests/locales.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck exit 0; targeted 4 files / 47 tests passed; full `pnpm check` 63 files / 1292 tests + build, exit 0; `git diff --check` clean. The three new cases are `lists the message timeline newest first and keeps the follow-up box above the list`, `posts a follow-up from the box above the list and shows it first with the count grown and the box cleared`, and `renders the newest-first message timeline and its top follow-up box in English`.

## Visual evidence

- Before: `docs/evidence/m1-message-order/before-detail-messages.png` — baseline `6ed5fded` real panel build, messages 32 → 17 → 11 minutes ago and the follow-up box below the list.
- After: `docs/evidence/m1-message-order/after-detail-messages.png` — branch build `1d3de60b`, messages 11 → 17 → 32 minutes ago and the follow-up box directly under `消息记录 3`.
- Both: 1440×1500, light theme, zh-CN, same seeded project Widgets and requirement `q-m1demo` (original submission + two human follow-ups + one agent reply), served by isolated DSH profiles; the temporary servers, profiles, states and baseline worktree were deleted afterwards.
