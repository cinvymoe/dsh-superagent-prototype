# C2 regression case: the service script merges and activates a local checkout

- Ticket: `7a346d2ced9ee30ed5862d8953acfe7d` (slice C2 of alignment `q-3603edff`「本地合入并生效」)
- Branch: `agent/prepare-activate-7a346d2ced9e`
- Base: `40191e32` (deployment `main`); the branch merged `main` `f29e841b` before the PR, so the slice commit is `c7cb98c9`
- PR: opened against `main` of `cinvymoe/dsh-superagent-prototype`; a person reviews and merges
- Scope: `scripts/dsh-superagent` only — the `prepare` and `activate` actions, their tests and two documentation sections. No panel/API/config-key/schema change. The read-only checkout facts of C1, the Deployment page action of C3 and the end-to-end flow of C4 are other slices.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `review.md` (full text in `docs/issues/review-C2-prepare-activate.md`) |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Targeted verification log | `docs/issues/evidence/c2-prepare-activate-tests.log` |
| Typecheck log | `docs/issues/evidence/c2-prepare-activate-typecheck.log` |
| Documentation test log | `docs/issues/evidence/c2-prepare-activate-docs.log` |
| Full verification log | `docs/issues/evidence/c2-prepare-activate-check.log` |
| Diff hygiene log | `docs/issues/evidence/c2-prepare-activate-diff.log` |

## How to re-run

```sh
pnpm vitest run tests/service-script.spec.ts
pnpm typecheck
pnpm vitest run tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: the service-script file reports 27 tests (13 existing plus 14 for the two actions); typecheck exits 0; the documentation file reports 14 tests; the full suite reports 64 files / 1329 tests plus a complete build; `git diff --check` prints nothing. The cases use a real temporary git checkout with a bare remote one commit ahead, stub `pnpm`/`ps`/`tmux`/`dsh`, and a mock management API that answers only while the pid it recorded is alive.

## Regression checks this case adds

| Check | Command | Expected |
| --- | --- | --- |
| Fast-forward only, then build once | `pnpm vitest run tests/service-script.spec.ts -t "fast-forwards to the remote main"` | HEAD moves to the remote commit, one parent, `pnpm install --frozen-lockfile` and `pnpm build` once, second run prints `up to date` and runs no pnpm |
| Refusals leave the checkout untouched | `-t "refuses prepare"`, `-t "refuses to fast-forward"` | Exit 1 for dirty tree, detached HEAD, non-`main`, divergence, unmatched/missing/malformed `--repository`, and a held lock; HEAD unchanged |
| Activate backs up then restarts | `-t "activates a new commit"` | `orchestrator.sqlite` and `-wal` copied under `.artifacts/backups/`, new `service.pid`, no `manually-stopped` marker |
| The three skip flags | `-t "skips activation"`, `-t "nothing answers"` | `--if-idle` (load.running 2), `--respect-stop`, `--only-when-behind` and an unanswered service each exit without stopping, backing up or launching |
| Startup failure rolls back | `-t "rolls the checkout"` | HEAD, database, `-wal`, rebuild and the previous pid all restored, rollback printed, exit 1 |
| Full suite | `pnpm check` | 64 files / 1329 tests and the build |
