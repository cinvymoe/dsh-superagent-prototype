# Test environment prerequisites

This case needs no physical device or architecture cross-build. It is a node/vitest plus browser-GUI case.

## Unit / integration tests

- Node 22 (`pnpm` 11.7.0), repository dependencies installed with `pnpm install`.
- Run the checks from the ticket worktree. The worker shell may export `GIT_CONFIG_GLOBAL`/`GIT_AUTHOR_*` and a localized git locale; the host-sensitive tests then fail on an untouched baseline too. Run the full gate as:

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

- Do not run two vitest suites concurrently: `tests/tools.spec.ts` has a 5000 ms per-test limit and timed out once under contention while its isolated run passed.

## Panel captures (Before/After)

- Isolated DSH profiles `c2-before` / `c2-after`, copied from an existing web-profile skeleton, with `dsh-superagent` linked to the baseline checkout (`afab266e`, `/tmp/c2-baseline`) and this ticket worktree; `webserver.port` 3101 / 3102 and state dirs `/root/.dsh/state/c2-before|after`. Delete them after capture; never point a capture at the live deployment state.
- Start with `/root/.bun/bin/dsh --profile c2-before --port 3101 --no-open --trusted-host 127.0.0.1`; the printed URL carries a token. Pass the profile before app flags; do not pass `web` as an extra argument.
- Headless Chromium: `/usr/bin/chromium` with `--no-sandbox`; viewport `1440x1100`, locale `zh-CN`, light theme.
- Seed the same SQLite state on both sides with one project `Widgets` and worktree root `/srv/worktrees`; for the Before side store the legacy `repository: 'acme/widgets'`, for the After side store `chain: 'p-widgets'`, `intakeRepository: 'acme/intake'`, `codeRepository: 'acme/widgets'`. Keep the GitHub Source chain `default: acme/intake → acme/widgets`.
- Navigation: click the sidebar button `Superagent`, then the panel tab `讨论`, then `新建项目` for the form screenshot; the project row is the Discuss page head.
