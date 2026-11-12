# Test environment prerequisites

No physical device, GUI, cross-build or screenshot transform is involved: this is a Node + vitest case over SQLite-backed application services. The panel specs use jsdom, but this slice adds no UI.

## Toolchain

- Node `v22.23.1`, pnpm `11.7.0` (`pnpm install --frozen-lockfile --offline` from the shared store).
- vitest `4.1.8`, TypeScript `6.0.3` as pinned by `package.json` / `pnpm-lock.yaml`.
- `node:sqlite` experimental warnings in the spec output are expected.

## Commands

```sh
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts    # targeted: 3 files / 50 tests
pnpm typecheck                                                                        # tsc --noEmit, exit 0
pnpm vitest run tests/panel-discuss.spec.tsx tests/http.spec.ts tests/docs.spec.ts    # related: 3 files / 38 tests
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check                                                                      # no output
```

The `env -u …` prefix removes injected git identity/locale values that otherwise make host-sensitive specs fail; it is the documented full-suite command for this repository.

## Evidence paths

`docs/issues/evidence/c1-align-rounds-{typecheck,targeted,check,check-retry,merge-typecheck,merge-targeted,check-postmerge,check-postmerge2}.log`.

## Notes

- `tests/local-align.spec.ts` starts a real runtime with a fake subprocess/Session host and a temporary state directory. The new alignment tests accept an align ticket, run the align tool, reject over HTTP and assert the relayed message, so they are slower (~4–6 s) and must keep the `afterEach` stop.
- The full suite runs many runtime/panel specs in parallel; on a loaded machine a 5 s individual timeout can occur in unrelated specs. Re-run the file standalone before treating it as a regression.
- After merging a newer `main`, run `pnpm typecheck` first: new tests in `main` may construct `LocalAlignment` and need the required `roundId`.
