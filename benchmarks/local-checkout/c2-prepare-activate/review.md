# Two-axis review · C2 (case summary)

Full text: `docs/issues/review-C2-prepare-activate.md`. Reviewed commit: `c7cb98c9`, merged with `main` `f29e841b` in `109d4721`. Verdict: **APPROVE on both axes**.

## Standards

| Check | Result |
| --- | --- |
| Single writer, no new configuration key, schema, migration or route | PASS |
| Every refusal happens before the first mutation | PASS |
| Reuses the existing `state()`/`stop()`/`start()`/`operation.lock` and the script's exit-code conventions | PASS |
| No `git pull`; a private fetch ref plus `merge --ff-only`, so no merge commit | PASS |
| Database copied only after the graceful stop; a restore drops the failed version's `-wal`/`-shm` first | PASS |
| Tests use real git and real `python3`, stub only the outside binaries, assert concrete output and state, and keep every existing case | PASS |
| Both documents match the printed messages and exit codes; `tests/docs.spec.ts` passes | PASS |
| Diff hygiene: no secrets, no debug leftovers, umask unchanged, `git diff --check` clean | PASS |

## Spec

All five frozen criteria pass with the evidence listed in the full review and in the README's regression table.

## Findings

- **F-1 fixed**: `activate` caught only `RuntimeError`, so a tmux or `OSError` failure would skip the rollback; activation and rollback now treat `OSError`, `RuntimeError` and `CalledProcessError` alike.
- **F-2 fixed**: a case now covers `activate` with nothing answering, the refusal that prevents stopping a service whose database location is unknown.
- **F-3 fixed**: the `--only-when-behind` case was renamed so its name states the behavior it protects.
- **F-4 accepted**: `prepare` force-fetches `refs/dsh-superagent/main` before the divergence check, so a refused run moves that private ref while HEAD and the worktree stay put.

## Not covered, stated honestly

The real `pnpm install`/`pnpm build` are stubbed; this repository's real build is covered by `pnpm check`, not a failing install inside a checkout. No user interface changed, so the PR carries no before/after captures.
