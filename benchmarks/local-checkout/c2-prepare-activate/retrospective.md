# Retrospective · C2

## Pitfalls found while implementing

1. **The script creates `.artifacts/` before the action runs.** `main()` makes the control directory for the lock, so a fixture checkout without a committed `.gitignore` looks dirty to its own `prepare`. Fixed by committing the fixture's `.gitignore` first; the real repository already ignores `.artifacts/`.
2. **`git pull` would fetch the wrong repository here.** The deployment's own checkout has an `origin` that names an upstream project, not the code repository. That is exactly why `prepare` matches the remote by URL instead of pulling the checked-out branch's upstream.
3. **A `--respect-stop` check written after the state read never fires.** A manually stopped service answers nothing, so the skip would become a refusal. The marker is checked inside the lock and before any HTTP call.
4. **`start` leaving its failed process behind.** Its timeout message says it left the process intact; a rollback that starts the previous version first would be refused as a duplicate. The rollback stops whatever it left before starting anything.
5. **The virtualenv git identity.** The machine sets `user.useconfigonly` and no global identity, so the test commits must pass `-c user.name`/`-c user.email`; otherwise `checkout()` fails before any case runs.
6. **The fixture needs an ignored place for its bare remote.** Putting it under `<root>/remotes/acme/widgets.git` keeps `--repository acme/widgets` matching by URL while staying invisible to the dirty check.
7. **A test named after the wrong flag.** The `--only-when-behind` case was first named as if `activate` always restarted; it was renamed so the case name states what it protects.

## What was adjusted during self-review

- `activate` caught only `RuntimeError` from `start`, so a tmux or `OSError` failure would have skipped the rollback. Both the activation and the rollback now treat `OSError`, `RuntimeError` and `CalledProcessError` the same way.
- A case was added for `activate` with nothing answering, because the documented refusal ("start the service once") is the difference between a safe skip and stopping a service whose database location is unknown.

## Residual risks

- The real `pnpm install --frozen-lockfile` and `pnpm build` are stubbed in the tests; a real build failure inside a checkout is only proven by the documented reversal path, not by a live build. `pnpm check` exercises the real build in this repository, which covers the command shape but not a failing install.
- `prepare` force-fetches `refs/dsh-superagent/main` before the divergence check, so a refused run still updates that private ref (HEAD and the worktree stay put). Harmless, but it means the ref is not a record of the last successful merge.
- `activate` reads the state before `prepare`, so a build that takes minutes can overlap with an Assignment that started afterwards; `--if-idle` narrows that window but cannot close it. A restart already ends running Assignments by design, and the health check plus rollback bound the damage.
