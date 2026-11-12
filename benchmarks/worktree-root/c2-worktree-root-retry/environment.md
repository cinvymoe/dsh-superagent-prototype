# Test environment prerequisites

This case needs no physical device or architecture cross-build. It is a node/vitest plus browser-GUI case.

## Unit / integration tests

- Node 22 (`pnpm` 11.7.0), repository dependencies installed with `pnpm install`.
- Run the checks from the ticket worktree. The worker shell may export `GIT_CONFIG_GLOBAL`/`GIT_AUTHOR_*` and a localized git locale; the host-sensitive tests (`tests/environment.spec.ts`, `tests/runtime.spec.ts`) then fail on an untouched baseline too. Run the full gate as:

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

## Panel captures (fresh After)

- Isolated DSH profile `c2-retry-after`, copied from an existing web-profile skeleton, with `dsh-superagent` linked to this ticket worktree, `webserver.port: 3095` and `stateDir /root/.dsh/state/c2-retry-after` (fresh state, never the live `superagent-test` deployment).
- Start with `node /root/.bun/bin/dsh --profile c2-retry-after --no-open`; do not pass `web` as an extra argument. The printed URL carries a token: `http://127.0.0.1:3095/?token=…`.
- Headless Chromium: `/usr/bin/chromium` with `--no-sandbox` (the Python Playwright package expects an uninstalled headless-shell build, so pass the system executable).
- Viewport `1440x1100`, locale `zh-CN`, light theme, same scenario/state as the committed Before captures.
- Navigation: click the sidebar button `Superagent`, then the panel tab `讨论`; the panel route lives in `sessionStorage['dsh-superagent/route']`, not the URL. Fill the project form (Widgets / acme/widgets / /srv/worktrees), submit a requirement, then open the `设置` tab and hover the `.dt-info` of the field labelled `执行目录的根目录` to show the root hint.
- Do not point a capture at the live `superagent-test` deployment: its state contains real tickets and private Feishu material.

## Evidence paths

- `docs/evidence/c2-worktree-root/before-*.png` — real captures of baseline `790f12f` (pre-C2).
- `docs/evidence/c2-worktree-root-retry/after-discuss-project-form.png`
- `docs/evidence/c2-worktree-root-retry/after-discuss-project-row.png`
- `docs/evidence/c2-worktree-root-retry/after-discuss-requirement-detail.png`
- `docs/evidence/c2-worktree-root-retry/after-execution-root-hint.png`
