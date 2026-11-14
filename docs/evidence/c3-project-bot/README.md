# C3 — a project's bot in its form and in the panel

Before/After captures for the project form, the Discuss page head and the project menu. Both sides use the same
route, viewport, theme, locale, seeded state and scroll position; only the built `dsh-superagent` differs.

## Revisions

- **Before**: deployment `main` @ `be7976af`, the slice-start HEAD, built from `git archive HEAD` in
  `/tmp/c3bot-before-src`.
- **After**: this ticket branch, built in the ticket worktree.

## Scenario

Both profiles (`c3bot-before`, `c3bot-after`) are copies of the proven `c1bot-after` profile with a scratch state
directory and isolated ports (3161 / 3160). Each state is a copy of the same seeded database:

- the same GitHub Source with the `default` chain on `/tmp/c1bot-gh-default` (account `agent-bot`) and the `tools`
  chain on `/tmp/c1bot-gh-tools` (account `tools-bot`), both over `cinvymoe/dsh-superagent-prototype`;
- the same six local projects, each owning its own chain: five leave the bot blank (Source default, `agent-bot`) and
  **工具链路工作区（Tools 面板与 MCP）** names `/tmp/c1bot-gh-tools` (`tools-bot`). Six projects also make the
  project strip overflow, so the **更多** menu is reachable on both sides.

The copied `master-id` was removed so each side starts its own main Session. No credentials or private content are
in the captures.

## Capture setup

- Started with `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open`
  and the token URL from its log.
- Chromium via Playwright: viewport `1440x1100`, `locale='zh-CN'`, `color_scheme='light'`, `timezone_id='Asia/Shanghai'`.
- Route: sidebar **Superagent** → **需求列表**, then the project tabs, **更多**, and **新建需求 → 编辑项目**; `#dt-page`
  scrolled to the top before every capture.

## Shots

- `before-requirements-head-default-bot.png` / `after-requirements-head-default-bot.png` — the Requirements page head
  of 文档链路工作区: Before names only the repository chain; After adds `机器人 @agent-bot`.
- `before-requirements-head-tools-bot.png` / `after-requirements-head-tools-bot.png` — the same head after switching to
  工具链路工作区: After shows `机器人 @tools-bot`, so the account follows the current project.
- `before-project-menu.png` / `after-project-menu.png` — the **更多** menu with all six projects: After lists each
  project's own bot beside its repository chain.
- `before-edit-form.png` / `after-edit-form.png` — the shared project form for 工具链路工作区: After adds the
  **机器人（GitHub CLI，可选）** field, pre-filled with that project chain's `/tmp/c1bot-gh-tools`, with the hint that an
  empty value keeps the Source default and an unusable or signed-out CLI is refused without losing the typed values.
