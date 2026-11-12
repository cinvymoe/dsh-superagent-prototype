# Test environment prerequisites

No physical device, GUI or architecture cross-build is involved: this is a node/vitest case over the strategy seam plus prompt assembly.

## Toolchain

- Node 22 (`pnpm` 11.7.0); run `pnpm install --frozen-lockfile` once in the ticket worktree.
- Run from the ticket worktree; the suite is hermetic (in-memory repositories, temp SQLite directories removed after each test). The PR branch stacks on the C1 contract branch, so the C1 core tests are present.

## Host-sensitive tests

The worker host exports `GIT_CONFIG_GLOBAL`/`GIT_AUTHOR_*` and a Chinese git locale, which makes three unrelated tests fail on an untouched baseline too:

- `tests/environment.spec.ts > fails when git cannot read the repository's configuration` (localized git message),
- `tests/runtime.spec.ts > runs setup again while the Feishu bot check failed...` and `> writes worker shims ... without mutating the host environment` (host PATH/`GIT_*`).

Run the full gate as:

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm test
```

With the cleanup the suite passes; without it the same three fail, as recorded for C1.

## Concurrency

Do not run two vitest suites at once; `tests/tools.spec.ts` has a 5000 ms per-test limit and can time out under contention.
