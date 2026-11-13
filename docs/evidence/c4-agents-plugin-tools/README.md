# C4 Agents panel — plugin-provided tools

Before/After captures for the Agents settings page. Both use the same route, viewport, theme, locale, seeded
state and scroll position; only the built `dsh-superagent` differs.

## Revisions

- **Before**: deployment `main` @ `57760521` (C2 `addableTools`/`addedTools` API, C3 runtime application and C1 model
  dropdowns merged; the panel has no plugin-tool section).
- **After**: the ticket branch's code commit `5a2e6a92`, rebased onto `57760521`; this evidence commit adds only the
  captures and this note.

## Build

```sh
# Before
git archive 57760521 | tar -x -C /tmp/c4plugin-before-src
cd /tmp/c4plugin-before-src && pnpm install --frozen-lockfile && pnpm build

# After (ticket worktree)
cd /data/project/workspace/dsh-worktrees/slice-ff6cfdc7d64d && pnpm build
```

Both builds completed with exit 0.

## Capture setup

- DSH profiles `c4plugins-before` and `c4plugins-after` are copies of the existing `c3local-after` profile (base/web
  bundles plus `dsh-feature-exec`), with `dsh-superagent` linked to the Before build and the ticket worktree and
  `webserver` on 10.126.126.6:3153 / 3154.
- Each state directory is a copy of the proven `c3local-after` state (a GitHub chain to
  `cinvymoe/dsh-superagent-prototype` and the setup stub `gh` at `/tmp/c3-fake-gh`); the copied `master-id` key was
  removed so each state starts its own master Session. No credentials or private content are in the captures.
- Started with `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open`
  and the token URL from its log.
- Browser: `/usr/bin/chromium` via Playwright, viewport 1440x1800, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`; route `settings/agents` and `#dt-page` scrolled to the top.
- The plugin tools come from the host's registered global tools (the profile's `dsh-feature-exec` and MCP tools).

## Shots

- `before-agents.png` — same page and viewport, with only the built-in required/optional tools.
- `after-agents.png` — the same page with the added **插件提供的工具** section (可添加 18 on the main Session card).
- `before-main-card.png` / `after-main-card.png` — the main Session card alone for a closer comparison.
- `after-plugin-added.png` — after clicking **添加** on `feature_exec_advance`: the tool moves under **已添加** (1) and the
  remaining 17 stay under **可添加**, with the draft kept (未保存 · 草稿已保留). The capture then removed it again, so no
  save was made and the seeded state is unchanged.
