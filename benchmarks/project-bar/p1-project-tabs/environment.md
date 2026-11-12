# Test environment prerequisites

This case needs no physical device or architecture cross-build. It is a node/vitest plus browser-GUI case.

## Unit / integration tests

- Node 22 (`pnpm` 11.7.0), repository dependencies installed with `pnpm install --frozen-lockfile`.
- Run from the ticket worktree. The worker shell may export `GIT_CONFIG_GLOBAL`/`GIT_AUTHOR_*` and a localized git locale; run the full gate as:

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

## Panel captures

- Isolated DSH profiles `p1-before` and `p1-after` were copied from an existing web-profile skeleton. `p1-before` links `dsh-superagent` to a detached baseline worktree at deployment `main` @ `3b8c6a8`; `p1-after` links it to this ticket worktree after `pnpm build`.
- Before/after servers ran separately with `node /root/.bun/bin/dsh --profile p1-before --no-open` (port 3095) and `--profile p1-after --no-open` (port 3096); each printed `http://127.0.0.1:<port>/?token=…`.
- One-shot state directories `/root/.dsh/state/p1-before` and `/root/.dsh/state/p1-after` were seeded in SQLite (`kv` keys `local-project:*` / `local-issue:*`) with the scenarios: two projects (Widgets with `/srv/worktrees`, Billing), six long-named projects, and no projects. The live `superagent-test` deployment was never used, so no real ticket or private Feishu material appears.
- Headless Chromium: `/usr/bin/chromium` with `--no-sandbox` (system executable; the Playwright Python package's bundled headless shell is not installed).
- Viewport `1440×1100` for the main pairs and `900×1100` for overflow, locale `zh-CN`, light theme, same scenario on both sides.
- Navigation: open the printed URL, click sidebar `Superagent`, then the panel tab `讨论`; the panel route lives in `sessionStorage['dsh-superagent/route']`. On the after build, click the project-bar `新建项目` button for the standalone page, or `更多` for the overflow menu.

## Evidence paths

- `docs/evidence/p1-project-tabs/before-discuss.png`, `after-discuss.png`
- `before-new-project.png`, `after-new-project.png`
- `before-overflow.png`, `after-overflow.png`, `after-more-menu.png`, `after-more-selected.png`
- `before-no-projects.png`, `after-no-projects.png`
- `after-created.png` (after-only post-create state)
