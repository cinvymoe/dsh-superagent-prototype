# Test environment prerequisites

No physical device, GUI, cross-build or screenshot transform is involved: this is a Node + vitest case over SQLite-backed application services. (The panel specs use jsdom, but this slice does not touch the panel view.)

## Toolchain

- Node `v22.23.1`, pnpm `11.7.0` (`pnpm install --offline --frozen-lockfile` from the shared store at `/data/.pnpm-store/v11`).
- vitest `4.1.8`, TypeScript `6.0.3` as pinned by `package.json` / `pnpm-lock.yaml`.
- `node:sqlite` experimental warnings are expected in the spec output.

## Commands

```sh
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts      # targeted: 2 files / 37 tests
pnpm typecheck                                                    # tsc --noEmit, exit 0
pnpm vitest run tests/locales.spec.ts tests/core-engine.spec.ts tests/docs.spec.ts   # related: 3 files / 139 tests
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check                                                  # no output
```

The `env -u …` prefix removes the injected git identity/locale that otherwise makes host-sensitive specs fail in the worker environment; it is the documented full-suite command in this repository.

## Evidence paths

`docs/issues/evidence/c2-execution-mode-red.log`, `c2-execution-mode-targeted.log`, `c2-execution-mode-typecheck.log`, `c2-execution-mode-regression.log`, `c2-execution-mode-check.log`.

## Notes

- `tests/local-align.spec.ts` starts a real runtime with a fake subprocess/Session host and a temporary state directory; its dispatch tests launch worker assignments, so they are slower (~7.5 s) and must keep the `afterEach` stop.
- The red log was produced by stashing `src` + `tests/fixtures/panel-server.ts`; do not reuse that stash sequence on a dirty tree without checking `git status` first.
