# Task contract (C1)

The full contract handed to the lane is `docs/issues/task-contract-C1-checkout.md`; this is the case-sized summary.

## Goal

Add a read-only management route `GET deployment/checkout` that answers the repository, path, branch, HEAD, dirty state and `restartRequired` of the checkout the running dsh-superagent was loaded from, using local read-only git commands only.

## Files

- new `src/app/checkout.ts`
- `src/app/http.ts` — `HttpHost.checkout` and the route
- `src/app/api.ts` — the typed response, `import type` only
- `src/app/runtime.ts` — `new Checkout(packageRoot())` and the host field
- new `tests/checkout.spec.ts`
- `docs/007-architecture.md` (Modules and Tests rows) and `docs/006-deployment.md` (Management API row)

## Design the lane had to follow

`repositoryOf` accepts the https forms (`https://[user[:token]@]github.com[:port]/owner/name[.git][/]`), the ssh URL forms (`ssh|git+ssh|git://[git@]github.com[:port]/…`) and the scp form (`[git@]github.com:owner/name[.git]`), case-insensitively, and answers a lowercase `owner/name`; any other host, a local path, a missing name or extra path segments are `undefined`. `readCheckout` runs `rev-parse --show-toplevel`, then `symbolic-ref --quiet --short HEAD`, `rev-parse HEAD`, `config --get remote.origin.url` and `status --porcelain` at that root, each command read on its own so a failure leaves its fact unknown; a status that cannot be read counts as dirty. `checkoutReasons` maps a reading to `notGit` (alone), `noRepository`, `detached`, `notMain`, `dirty`. `restartRequired(start, head)` is `start.dirty || start.head !== head`. `Checkout` starts the reading in its constructor and `status()` awaits it before reading the disk. The default runner refuses every subcommand outside `CHECKOUT_GIT = ['rev-parse','symbolic-ref','config','status']`, clears `GIT_LOCATION` and disables prompts.

## Constraints

No new configuration key, no storage, no schema change, no panel UI or copy, no prompt text, no new dependency. `Api` and `http.ts` import the module as a type only. Every class and exported function carries the repository's JSDoc style.

## Verification (all run on the final code)

```sh
pnpm vitest run tests/checkout.spec.ts
pnpm typecheck
pnpm vitest run tests/http.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts tests/client.spec.tsx
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```
