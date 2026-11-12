# C3 regression case: create and edit a project's repository chain from one form

- Ticket: `7da08cb013a15d3c5238a983664829d0` (slice C3 of alignment `q-141a6a1e`「每个项目独立 / 旧版单链路删除」)
- Branch: `agent/slice-7da08cb013a1`
- Base: `afab266e` (deployment `main`, includes C1 / PR #11); depends on C2 (PR #13, head `df875f01`) and contains its commits
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/16 (state OPEN; merge after #13)
- Scope: the standalone project page creates and edits a project; the Discuss page-head edit entry opens the current project's form pre-filled; saving `PUT local/projects/:id` reloads and returns; a refused save keeps the page and values; editing one project leaves the other project's two repositories and chain unchanged.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `review.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Raw verification log | `evidence/verification.log` |
| Targeted verification log | `evidence/targeted.log` |
| Timeout rerun evidence | `evidence/followups-rerun.log` |

## How to re-run

```sh
npx vitest run tests/panel-projects.spec.tsx tests/panel-discuss.spec.tsx tests/navigation.spec.ts tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: targeted 4 files / 45 tests (this case's files; the recorded run included three related suites for 7 files / 78 tests); full `pnpm check` passes (typecheck + 63 files / 1263 tests + build).

## Visual evidence

- Before: `docs/evidence/c3-project-edit/before-discuss-head.png`, `before-new-project.png`, `before-other.png` (baseline `afab266e`, real panel build)
- After: `docs/evidence/c3-project-edit/after-discuss-head.png`, `after-new-project.png`, `after-edit-form.png`, `after-saved-head.png`, `after-other.png` (this branch, 1440x1100, light, zh-CN, real panel instance)
- The pair shows the single execution-repository field becoming intake + code repository fields, the page-head edit entry with pre-filled values, and the other project staying `acme/intake → acme/other` after the first project is saved as `acme/intake → acme/gadgets`.
