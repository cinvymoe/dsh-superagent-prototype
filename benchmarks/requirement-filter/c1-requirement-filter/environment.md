# Test environment prerequisites

Node 22 / pnpm 11.7.0 with dependencies installed (`pnpm install --frozen-lockfile`); no device or cross-build is involved.

## Unit / integration

Run from the ticket worktree. The worker host exports `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM` and a localized git, which makes a few unrelated assertions in `tests/environment.spec.ts` / `tests/runtime.spec.ts` fail; run the gate clean:

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
  -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

## Panel captures

- Baseline: a `git clone` of `cinvymoe/dsh-superagent-prototype` main `40191e32` at `/tmp/c1-filter-baseline` (fetched to the PR merge target), then `pnpm install --frozen-lockfile && pnpm build`.
- Two isolated DSH profiles copied from an existing web-profile skeleton: `c1req-before` links the baseline checkout, `c1req-after` links the ticket worktree after `pnpm check` (which rebuilds). Ports 3121/3122, one-shot state dirs `/root/.dsh/state/c1req-before|c1req-after`.
- Both state dirs were seeded from one script (`/tmp/c1-seed.mjs`) that writes the same SQLite rows into a fresh database: `kv` (`schema`, `master-id`, `local-project:*`, `local-issue:*` with proposed/confirmed/rejected/closed alignments), plus matching `thread`, `trigger`, `trigger_thread` rows. Two projects (`Widgets`, `Billing`) and seven requirements; thread `pending` stays empty so no eval runs.
- Servers: `node /root/.bun/bin/dsh --profile <name> --no-open`, printing the token URL; the panel opens at the sidebar entry `Superagent`.
- Capture: Playwright (Python) with system `/usr/bin/chromium --no-sandbox`, viewport 1440×1100, locale zh-CN, light color scheme, route seeded via `sessionStorage['dsh-superagent/route']` before opening the panel.
- The live deployment and real GitHub/Feishu state are never used.

## Evidence paths

- `docs/evidence/c1-requirement-filter/`: `before-default.png`, `after-default.png`, `after-closed.png`, `before-detail-back.png`, `after-closed-back.png`, plus `after-detail.png`, `after-switched-project.png`, `after-all.png`, `after-all-widgets.png`.
- Command logs: `docs/issues/evidence/c1-requirement-filter-*.log`.
