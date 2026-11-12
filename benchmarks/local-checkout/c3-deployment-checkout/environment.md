# Test environment prerequisites

Node 22 / pnpm 11.7.0 with dependencies installed.

## Unit / integration

```sh
pnpm vitest run tests/prepare.spec.ts tests/checkout.spec.ts tests/http.spec.ts tests/panel-deployment.spec.tsx
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
  -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

`tests/prepare.spec.ts` runs real git and real python (the service script) on temporary repositories; it stubs `pnpm` on PATH.

## Panel captures

- Baseline: `git clone https://github.com/cinvymoe/dsh-superagent-prototype.git` at `422a21a4`, `pnpm install --frozen-lockfile && pnpm build`.
- After: `git clone` of the ticket worktree at `cc0a5d33`, `origin` set to the GitHub repository and a `url.<local bare>.insteadOf` pointing at a local bare mirror whose `main` is one empty commit ahead; `pnpm install --frozen-lockfile && pnpm build`.
- Two isolated DSH profiles copied from the superagent profile: `c3local-before`/`c3local-after`, links to the two checkouts, `webserver` 10.126.126.6:3141/3142, separate `stateDir`.
- Each state DB is seeded with one GitHub chain `cinvymoe/dsh-superagent-prototype` and a stub `gh` CLI answering `api user` / `api repos/...`; no live GitHub/Feishu state is used.
- Capture: Python Playwright + system `/usr/bin/chromium --no-sandbox`, viewport 1440×1100, zh-CN, light, route `sessionStorage['dsh-superagent/route'] = settings/deployment`.

## Traps

- The success flow runs `pnpm build` inside the linked checkout, which makes the running panel reload its bundle: after a merge, open a fresh page before reading the DOM.
- `git remote -v` displays `insteadOf`-rewritten URLs, but `git config --get remote.origin.url` and `git config --get-regexp '^remote\..*\.url$'` stay raw — which is what the panel reads.
- The initial implementation omitted the script's `prepare` action; the real end-to-end run is what caught it.
