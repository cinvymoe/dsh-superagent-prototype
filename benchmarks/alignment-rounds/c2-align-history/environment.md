# Test environment prerequisites · C2

- Node/pnpm as pinned by the repository `package.json`/`pnpm-lock.yaml`; the worktree shares a sibling worktree's `node_modules` through a symlink (identical lockfile).
- No real Feishu, GitHub or Executor Session is needed: `tests/panel-discuss.spec.tsx` runs in jsdom against `tests/fixtures/panel-server.ts` and asserts the posted request bodies.
- Screenshot captures need a built bundle (`pnpm build`), a DSH profile whose `dsh-superagent` link points at the built worktree, an isolated `stateDir` with the seeded SQLite database, `/usr/bin/chromium` headless and Python Playwright.
- The capture state is a synthetic, isolated SQLite seed (`kv`/`trigger`/`thread`/`trigger_thread`, schema 11): one project `Widgets`, three requirements (two-round, single confirmed, unaligned). Both revisions read the same database; the baseline (C1) reads the `alignment` mirror, this branch reads `alignments`.
- Capture profile ports and state directories are local-only; tokens are printed by `dsh web` and are not committed.

## Commands

```sh
cd <worktree> && pnpm build
node /tmp/c2-seed.mjs /root/.dsh/state/c2align-before   # and ...-after
dsh --profile c2align-before --no-open                  # and c2align-after
python3 /tmp/c2-capture.py "<printed url>" /tmp/c2-shots before   # and after
```
