# A — a project's own prepare command and blocked commands

Before/After captures of the project form and the Requirements page head for slice A of issue `q-8b3335ac`.
Both sides use the same route, viewport, theme, locale, seeded state, current project and scroll position; only the
built `dsh-superagent` differs.

## Revisions

- **Before**: `main` @ `c69e32da`, the slice-start HEAD, built from `git archive` into `/tmp/sliceA-before-src`.
- **After**: this ticket branch at merge commit `21cd097` (feature commit `fa2977fe` merged with `main` @ `7172f006`),
  built in the ticket worktree. The later evidence commit only adds the captures below; its tree keeps the captured UI
  code unchanged.

## Scenario

- One DSH profile `sliceA`, copied from the proven `c3bot-after` profile, on port 3170 with its own state directory.
  The profile's `dsh-superagent` link was swapped between the Before and After builds, so the sidebar, workspace list
  and routes are identical in both captures.
- The state is a copy of the same seeded database: the GitHub Source with the `default` and per-project chains, the six
  local projects of the earlier captures. Project **工具链路工作区（Tools 面板与 MCP）** (`p-tools`) carries a
  `prepare` command (`git -C /srv/repos/widgets worktree add "$DSH_SUPERAGENT_DIR"`) and extra blocked commands
  (`rm curl`). The Before build ignores the two fields it does not know; the After build shows them. The copied
  `master-id` was removed so each start opens its own main Session. No credentials or private content are in the
  captures.
- Captured with `/usr/bin` chromium via Playwright: viewport `1440x1100`, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`.
- Route: sidebar **Superagent** → route `requirements` with the project `p-tools`; the form capture uses the edit route
  `requirements` + `edit=p-tools`. `#dt-page` was scrolled to the top before every capture.

## Shots

- `before-project-edit.png` / `after-project-edit.png` — the shared project form for 工具链路工作区: Before carries
  the name, two repositories, worktree root and bot fields; After adds **准备命令（可选）** pre-filled with the stored
  command and **额外禁止的命令（可选，空格分隔）** pre-filled with `rm curl`, each with its hint, and keeps the bot
  field.
- `before-requirements-head.png` / `after-requirements-head.png` — the Requirements page head of the same project:
  After adds `准备命令已配置` and `额外禁止：rm curl`, so a project's execution environment is visible without opening
  the form. Both sides show the same repositories and `机器人 @tools-bot`.