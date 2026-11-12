# Task contract · C2

## Goal

Add `prepare` and `activate` to `scripts/dsh-superagent` so a merged commit can be built into a local checkout and made effective by the profile's own service process, with the safety boundaries the alignment froze, and record the behavior in the deployment documentation.

## Files

- `scripts/dsh-superagent` — the two actions, their git/build/database helpers, `state()` extended with `stateDir` and `running`, argparse and dispatch.
- `tests/service-script.spec.ts` — the fixtures (real temporary checkout with a bare remote one commit ahead, stubbed `pnpm`, a mock state API keyed to a live pid, a tmux stub whose launches can be made to fail) and the cases.
- `docs/006-deployment.md` — a “Prepare and activate a local checkout” section, the Upgrade cross-reference, and troubleshooting rows.
- `docs/007-architecture.md` — the tests table row.

## Behavior

| Step | Requirement |
| --- | --- |
| Remote | `git remote -v` fetch lines whose URL's last two path segments name `--repository`; `origin` preferred, otherwise the first by name; no match is a refusal that names the repository |
| Guards | Detached HEAD, a branch other than `main`, a non-empty `git status --porcelain`, and a `merge-base --is-ancestor` failure are refusals that change nothing |
| Merge | `git fetch --no-tags <remote> +refs/heads/main:refs/dsh-superagent/main`, then `git merge --ff-only`; equal commits print `prepare: up to date at <sha> on main` and build nothing |
| Build | `pnpm install --frozen-lockfile` then `pnpm build`, each printed; a failure resets to the previous commit, rebuilds it and exits 1 |
| Backup | After the stop, copy `orchestrator.sqlite` and `-wal` into `.artifacts/backups/orchestrator-<profile>-<stamp>/`, keep the newest ten |
| Skips | `--respect-stop` before reading the state, `--if-idle` on `load.running > 0`, `--only-when-behind` on an unchanged HEAD; each prints why and exits 0 |
| Rollback | Stop what the failed start left, `git reset --hard` the previous commit, restore the database (dropping `-wal`/`-shm` first), rebuild, start, print each step, exit 1 |
| Concurrency | The profile's `operation.lock` remains the only gate; a second concurrent action exits 1 with the existing message |
| No new state | Nothing but `.artifacts/` and the checkout is written; no configuration key, API or migration |

## Verification

```sh
pnpm vitest run tests/service-script.spec.ts
pnpm typecheck
pnpm vitest run tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

## Done when

The five frozen criteria hold, the service-script file reports 27 tests, the full suite and build pass, and the documentation matches the printed messages and exit codes.
