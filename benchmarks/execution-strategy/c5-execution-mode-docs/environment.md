# Test environment prerequisites

Node 22 and pnpm 11.7.0 with dependencies installed (`pnpm install --frozen-lockfile`); no device, browser, GUI or cross-build is involved. This is a docs-only slice, so its evidence is command logs and the document diff.

## Docs and related tests

```sh
pnpm vitest run tests/docs.spec.ts
pnpm vitest run tests/docs.spec.ts tests/local.spec.ts tests/local-align.spec.ts tests/panel-discuss.spec.tsx tests/prompts.spec.ts tests/locales.spec.ts
```

## Full check

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected on branch `agent/slice-8542a15caed3` after merging `main` `934a1f07`: docs spec 16/16; related set 6 files / 108 tests; full check 64 files / 1321 tests with typecheck and build; no diff-check output.

## Notes

- The slice records no screenshots: the panel switch and its Before/After evidence belong to C4 (`docs/evidence/c4-execution-mode/`).
- No network access is needed beyond the installed toolchain; the full check was run with git identity environment variables cleared, as the deployment requires.
