# Patterns · C2

## Local merge keyed to a configured repository, not to a branch's upstream

`prepare` never runs `git pull`. It resolves the remote whose URL names the configured `owner/name` and fetches that remote's `main` into a private `refs/dsh-superagent/main`, then only fast-forwards. A checkout whose `origin` is an upstream fork therefore still merges from the code repository the deployment is configured for, and a divergence is a refusal instead of a merge commit.

## Blanket refusals before the first mutation

`prepare` resolves the remote, checks the branch, checks the worktree and only then fetches. Every refusal happens before anything changes, so "exit 1 and the checkout is untouched" is a property of the order, not of a cleanup path. The only mutation that can fail is the build, and that failure has its own reversal (`reset --hard` plus a rebuild).

## One writer, with the profile lock as the only gate

Both actions run inside the existing `operation.lock`, so a concurrent `prepare`, `restart` or `status` is refused with the message the script already printed. No second lock, no heartbeat file, no new state to keep consistent.

## Database backup after the graceful stop

A running service keeps SQLite in WAL mode, so copying it live can capture a torn snapshot. `activate` stops first (the graceful stop checkpoints and removes the `-wal`), then copies `orchestrator.sqlite` and, when present, `-wal`. A restore deletes the failed version's `-wal`/`-shm` before copying, so a stale log cannot be replayed on top of the restored database.

## Health as the only success signal, with an injected failure to test the rollback

`activate` reuses `start`'s health loop unchanged and treats its timeout as the failure to roll back from. The test injects that failure without touching the implementation: the first tmux launch prints no pane pid, so no process is recorded and health never comes true, while the second launch (after the rollback rebuilt the previous commit) prints a live pid and its `ps` line. The mock API answers only while that pid is alive, so "the previous version is running again" is proven by the same signal the real script uses.

## Idle, stopped and up-to-date as three explicit skips

An unattended check calls `activate --only-when-behind --if-idle --respect-stop`. Each skip is checked at the cheapest point where it is knowable: the manual stop marker before any HTTP call, the Executor load from the `GET state` the action already reads, and the unchanged HEAD from the `prepare` it already runs. Each prints why it skipped and exits 0, so the caller can stay silent.
