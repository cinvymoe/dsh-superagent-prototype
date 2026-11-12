# Reusable patterns

## Success: read-only is structural, not a promise

Put the allow list in the runner, not in the call sites: `runGit` refuses any subcommand outside `CHECKOUT_GIT`, so adding a `fetch` later would fail loudly instead of quietly reaching the network. The test then proves it twice: it records every argv the runner receives and asserts each one is on the list (whole arguments compared, so the config key `remote.origin.url` does not read as the `git remote` command), and it hashes every work tree file plus HEAD, `status --porcelain` and `for-each-ref` before and after the read.

Next time: when an acceptance criterion says "only local read-only commands", make the command set a tested constant in the module and assert the recorded argv, instead of reviewing call sites by eye.

## Success: the comparison baseline is captured when the instance starts

`restartRequired` compares the disk with what this instance found at start, so `Checkout` starts that reading **in its constructor** and `status()` awaits it. A lazy first-use reading would answer "no restart needed" when a merge landed before the first request — exactly the case the feature exists for.

Next time: any "changed since start" fact needs a start capture at construction or process start, never at first use.

## Success: unknown facts stay unknown, and unknown never reads as safe

Each git command is read on its own (`read()` → `undefined` on failure), so one unreadable fact does not fail the whole route. The one asymmetry is deliberate: an unreadable `status` counts as **dirty**, because a clean verdict is a claim and a read must not claim it without inspecting the tree.

Next time: decide per fact whether failure means "unknown/unavailable" (safe default) or "not present"; document the asymmetry in the JSDoc and test it with a stubbed runner.

## Success: `symbolic-ref`, not `rev-parse --abbrev-ref`

On a detached HEAD, `git rev-parse --abbrev-ref HEAD` prints `HEAD` — a plausible branch name. `git symbolic-ref --quiet --short HEAD` exits non-zero instead, which is the signal the reason code needs.

Next time: detect detached HEAD with `symbolic-ref`; treat `abbrev-ref`'s `HEAD` output as a bug waiting to happen.

## Success: temporary repositories for git behaviour, never the workspace

Every behavioural case builds `mkdtempSync` repositories with `git init -q -b main`, adds one commit and only then asserts. `gitEnv()` from `tests/fixtures/git.ts` strips inherited `GIT_DIR`-family variables (tests can run under `git rebase --exec`), and commits pass explicit `GIT_AUTHOR_*`/`GIT_COMMITTER_*` because the deployment's global git config sets `user.useConfigOnly = true`. Detached and non-main fixtures add an https remote, otherwise their readings legitimately carry `noRepository` on top of the code under test.

Next time: a git-behaviour test that reads the repository under test is a flake generator; copy this fixture recipe.

## Success: a type-only import keeps Node code out of the panel bundle

`api.ts` is bundled into the panel, so it may only `import type { CheckoutView }` from the new module; the `http.ts` host interface uses `Pick<Checkout, 'status'>` behind `import type` too. The Node child-process code therefore never reaches the browser bundle.

Next time: a new host-side module consumed through `Api` must be referenced by type only; check the panel import test still passes.

## Pitfall: the exhaustive `ROUTES` map in the panel fixture

`tests/fixtures/panel-server.ts` types `ROUTES` as `{ [K in keyof Api]: Route<K> }`, so any new `Api` entry breaks `pnpm typecheck` until the fake API answers it. Add one static answer with a comment (no page polls it yet); do not loosen the map.

## Pitfall: `git status` in a subdirectory is path-limited

`git status --porcelain` run with `cwd` inside a repository reports only that subdirectory. The first read (`rev-parse --show-toplevel`) must therefore return the root, and every later command runs there — `packageRoot()` can sit below the checkout root.
