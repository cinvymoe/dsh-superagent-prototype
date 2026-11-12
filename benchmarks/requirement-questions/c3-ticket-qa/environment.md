# Test environment prerequisites

- Node `v22.23.1`, pnpm `11.7.0` (the repository's `packageManager`), DSH packages pinned at `0.2.1-alpha.2`.
- Worktree: `/data/project/workspace/dsh-worktrees/fork-12b1b458e8d8`, branch `agent/fork-12b1b458e8d8`.
- Dependencies: the worktree began without `node_modules`; it was symlinked from the sibling worktree
  `slice-5e9fa76642ab`, whose `pnpm-lock.yaml` is byte-identical (md5 `2e02280f30d64ba2ea1ceb86ed9f2daa`). `node_modules/`
  is gitignored, so the link is never committed. `pnpm install` was not run.
- No network access is needed for the suite; every DSH tool (session controller, workspace registry, subprocess,
  persistence) is the in-memory fixture in `tests/fixtures/host.ts`.
- Host-environment caveat: this host process exports `GIT_CONFIG_GLOBAL=/root/.dsh/state/superagent/worker-gitconfig`
  and `LANG=zh_CN.UTF-8`. A plain `pnpm vitest run` then fails 3 tests in `tests/environment.spec.ts` and
  `tests/runtime.spec.ts` (git's localized error text and the worker git config). The untouched baseline reproduces the
  same three; run the clean suite as:

  ```sh
  env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm vitest run
  ```

- The Q&A timeout test uses a 20 ms limit and the fake host's status transitions; it needs no fake timers and no model
  provider. Nothing calls a real LLM, so answer quality is not covered here.
