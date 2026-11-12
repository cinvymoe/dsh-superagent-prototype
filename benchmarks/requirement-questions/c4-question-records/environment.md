# Test environment · C4

- Node 22.23.1, pnpm 11.7.0, vitest 4.1.8; SQLite-backed `Store` on a temp directory per test.
- No device, GUI, screenshot or live DSH fork is needed: the slice is unit + HTTP/in-process runtime tests.
- `node_modules` is the worktree's own install (same lockfile as `main`); no new dependency was added.

## Known host-environment failures (not caused by this slice)

A plain `pnpm test` in this host process reports 3 failures, reproduced on an untouched `main` @ `422a21a4` worktree:

1. `tests/runtime.spec.ts` ×2 assert `process.env.GIT_CONFIG_GLOBAL` is undefined while this host exports
   `/root/.dsh/state/superagent/worker-gitconfig`.
2. `tests/environment.spec.ts` expects an English `git` error (`/bad config/`) while this host runs with `LANG=zh_CN.UTF-8`
   and `git` answers in Chinese.

Re-running those two files with `env -u GIT_CONFIG_GLOBAL LC_ALL=C LANG=C` passes 108/108.

## Prepare

```sh
pnpm install --frozen-lockfile   # only if node_modules is missing
```
