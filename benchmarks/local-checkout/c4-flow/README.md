# C4 regression case: the documented flow from a merged pull request to a running checkout

- Ticket: `34aa692db47be2161da69571204aa9eb` (slice C4 of alignment `q-3603edff`「本地合入并生效」)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/41 (open against `main`)
- Base: `72b4c4a8`; the branch merged `main` `aa326483` before delivery
- Scope: documentation only — `docs/005-panel.md`, `docs/006-deployment.md`, `docs/007-architecture.md` and `tests/docs.spec.ts`. No `src/`, `scripts/`, `prompts/` or locale change.
- Regression focus: the docs that explain `prepare`/`activate` must keep matching the implemented output, exit codes, panel labels and the two restart forms; the assertions in `tests/docs.spec.ts` fail when a pinned sentence drifts.

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Task contract | `task-contract.md` |
| Two-axis review | `review.md` (full text in `docs/issues/review-C4-flow.md`) |
| Test environment prerequisites | `environment.md` |
| Retrospective | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Evidence | `docs/issues/evidence/c4-flow-*.log` |

## How to re-run

```sh
pnpm vitest run tests/docs.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
  -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: the documentation file reports 19 tests; typecheck exits 0; the full suite reports 67 files / 1400 tests plus the build; `git diff --check` prints nothing.

## Regression checks this case adds

| Check | Command | Expected |
| --- | --- | --- |
| The merge-to-effective flow stays documented with the script's real output | `pnpm vitest run tests/docs.spec.ts -t "walks a merged pull request"` | The four-step section, `prepare: fast-forwarded from …`, `"restartRequired": false`, the no-host-restart rule, the hourly prompt and its reporting rule are all present |
| The panel and architecture cross-references stay truthful | `-t "names the running checkout"`, `-t "states in the architecture document"` | **Running checkout** / **Pull and build** are described in 005; 007 keeps the "rebuilt code needs the loading process to restart" sentence |
| Documented commands still exist | `grep -n "choices=\['start', 'stop', 'restart', 'status', 'prepare', 'activate'\]" scripts/dsh-superagent`; `grep -n "GET deployment/checkout" src/app/api.ts` | Both match; `--if-idle`, `--only-when-behind`, `--respect-stop` and `--repository` stay in `scripts/dsh-superagent` |
