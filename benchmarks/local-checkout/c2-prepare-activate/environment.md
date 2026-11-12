# Test environment · C2

The service-script cases need no service, no network and no real pnpm:

- **Python 3** — the script is run with `python3` from the temporary checkout, so the tests exercise the real interpreter the operator uses.
- **git 2.28 or later** — `checkout()` needs `git init -b main`; it commits with `-c user.name`, `-c user.email` and `-c commit.gpgsign=false` because the machine's global git configuration enables `user.useconfigonly` and names no identity.
- **A temporary root whose path contains a space** — `mkdtempSync(join(tmpdir(), 'service script '))`, which keeps the quoting of the checkout and log paths under test.
- **Stubs on `PATH`, ahead of the real binaries** — `ps` (reads `ps.txt`/`ps-started.txt` and filters by `kill -0`), `tmux` (logs its arguments, records the pane pid in `current-pid`, can skip the first launch), `dsh` (exits 0) and `pnpm` (appends its arguments to `pnpm.log`).
- **A mock management API** — `serving()` answers `GET state` only while the pid in `current-pid` is alive, which is what a stopped service does: nothing.
- **A committed `.gitignore` in the fixture checkout** — it ignores `bin/`, `remotes/`, `ps.txt`, `ps-started.txt`, `tmux.log`, `pane*`, `launched`, `held`, `pnpm.log`, `launches`, `current-pid`, `state/`, `rollback.ps` and `.artifacts/`. Without it the script's own `.artifacts/control` directory, created before any action runs, would make the worktree look dirty and every `prepare` would refuse.
- **A bare remote inside the ignored fixture directory** — `<root>/remotes/acme/widgets.git`, pushed and then left one commit ahead by resetting the checkout back. `--repository acme/widgets` matches it through the URL's last two path segments, so the fixture needs no GitHub access.

Nothing here touches the machine's own profile, tmux session or state directory: every path the script writes is under the temporary root.
