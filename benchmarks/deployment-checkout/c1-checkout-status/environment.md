# Test environment prerequisites

No physical device, GUI, cross-build or screenshot transform is involved: this is a Node + vitest case over temporary git repositories. Nothing is captured from a screen.

## Toolchain

- Node `v22.23.1`, pnpm `11.7.0`; `pnpm install --frozen-lockfile` from the shared store.
- git `2.39.5`, whose `git init -b main` the fixtures rely on.
- vitest `4.1.8`, TypeScript `6.0.3` as pinned by `package.json` / `pnpm-lock.yaml`.
- The deployment's injected `GIT_CONFIG_GLOBAL` sets `user.useConfigOnly = true`, so commits in fixtures must pass `GIT_AUTHOR_*` / `GIT_COMMITTER_*` explicitly; `tests/fixtures/git.ts`'s `gitEnv()` only strips the `GIT_DIR` family.

## Commands

```sh
pnpm vitest run tests/checkout.spec.ts      # targeted: 1 file / 19 tests
pnpm typecheck                              # tsc --noEmit, exit 0
pnpm vitest run tests/http.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts tests/client.spec.tsx   # related: 4 files / 24 tests
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check                            # no output
```

The `env -u …` prefix removes the injected git identity/locale that otherwise makes host-sensitive specs fail in the worker environment; it is this repository's documented full-suite command.

## Evidence paths

`docs/issues/evidence/c1-checkout-red.log`, `c1-checkout-targeted.log`, `c1-checkout-typecheck.log`, `c1-checkout-regression.log`, `c1-checkout-check.log`.

## Notes

- Every behavioural case creates its own `mkdtempSync` repository, so the suite never reads the repository under test; it runs in about 0.6 s for 19 cases.
- The read-only case hashes the work tree files and compares `rev-parse HEAD`, `status --porcelain` and `for-each-ref` before and after a read; keep that shape when adding commands to the reader.
- The deployed plugin checkout on this machine is `/root/src/dsh-superagent-prototype` → `/data/project/dsh-superagent`, whose `origin` is the upstream and whose pull request target is the `deployment` remote — the reason the merge slice must compare against the deployment repository.
