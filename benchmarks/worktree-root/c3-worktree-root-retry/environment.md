# Test environment prerequisites

This case is documentation-only: no physical device, architecture cross-build or browser capture is needed.

## Toolchain

- Node 22 (`node -v` → v22.23.1 in the test host), `pnpm` 11.7.0.
- Install once in the ticket worktree: `pnpm install --frozen-lockfile`.

## Runs

```sh
pnpm vitest run tests/docs.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm test
git diff --check
```

The worker shell may export `GIT_CONFIG_GLOBAL` / `GIT_AUTHOR_*` and a localized git locale, which make host-sensitive tests (`tests/environment.spec.ts`, `tests/runtime.spec.ts`) fail on an untouched baseline. Unset them and pin `LC_ALL=C` for the full gate; the logged full run above uses that environment and passes 62/62 files.

## Evidence paths

- `docs/issues/evidence/c3-docs-spec.log`
- `docs/issues/evidence/c3-typecheck.log`
- `docs/issues/evidence/c3-full-test.log`
- `docs/issues/evidence/c3-diff-check.log`
- `docs/issues/evidence/c3-diff-stat.log`
- `docs/issues/evidence/c3-slice.patch`
- This case's combined log: `evidence/verification.log`

## No visual evidence

The slice changes no UI; the panel descriptions are made to match the existing panel fields (labels/hints in `src/client/locales.ts`). A Before/After screenshot pair would only show an unchanged UI, so the PR documents the no-UI-change fact instead of presenting a meaningless comparison.
