# Test environment prerequisites

Node 22, pnpm 11.7.0, dependencies installed with `pnpm install --frozen-lockfile`.

## Commands

```sh
pnpm vitest run tests/docs.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
  -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

The full run compiles the TypeScript sources and runs all suites, including `tests/service-script.spec.ts`, `tests/prepare.spec.ts` and `tests/panel-deployment.spec.tsx`, so the documented `prepare`/`activate` output and exit codes stay covered by implementation tests.

## Device / GUI / capture

None. This slice changes documentation and documentation tests only: no device, no screen orientation, no screenshot rotation and no panel capture. The earlier panel evidence lives with C3 (`benchmarks/local-checkout/c3-deployment-checkout/environment.md`).

## Traps

- `tests/docs.spec.ts` collapses whitespace with `prose()` and matches exact sentences: a pinned sentence must be a standalone sentence with its capital letter where the test expects it.
- Numbered documents may link only to earlier numbers; `005` cannot link `006`. The cross-reference is `007 → 006` and `006 → 005`.
- The management API examples use the script's default port `3082`; the panel may run on another port, which the deployment page names.
