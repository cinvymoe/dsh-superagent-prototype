# C1 — each chain resolves its own bot identity

Before/After captures of the GitHub Source settings card. Both use the same route, viewport, theme, locale,
seeded state shape and scroll position; only the built `dsh-superagent` differs.

## Revisions

- **Before**: deployment `main` @ `a32f2e55`, the slice-start HEAD, built from `git archive HEAD` in
  `/tmp/c1bot-before-src`.
- **After**: this ticket branch, built in the ticket worktree.

## Scenario

Both profiles (`c1bot-before`, `c1bot-after`) are copies of the proven `c3local-after` profile with a scratch state
directory and an isolated port. Each state has the same GitHub Source with two chains
(`default` and `tools`) pointing at `cinvymoe/dsh-superagent-prototype`, and the same Source-level CLI
`/tmp/c1bot-gh-default`, a setup stub that reports `agent-bot`. The After state additionally gives `tools` its own
CLI `/tmp/c1bot-gh-tools`, which reports `tools-bot`.

The copied `master-id` was removed so each state starts its own main Session. No credentials or private content
are in the captures.

## Capture setup

- Started with `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open`
  and the token URL from its log.
- Chromium via Playwright: viewport `1440x1100`, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`.
- Route: sidebar **Superagent** → panel tab **设置** (`settings/source`). The GitHub card was scrolled into view
  and captured at the same scroll position on both sides.

## Shots

- `before-github-source.png` — the card before this slice: two chain rows without a per-chain CLI field, one
  **智能体的 GitHub CLI** and one **当前账号 @agent-bot**.
- `after-github-source.png` — the same card after this slice: each chain row has its own CLI field, the default
  CLI is fallback-only, and **每条链路的账号** shows `default: @agent-bot; tools: @tools-bot`.
- `before-settings-viewport.png` / `after-settings-viewport.png` — the same card in the full 1440×1100 viewport for
  context.
