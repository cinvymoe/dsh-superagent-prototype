# S2 Agents panel — custom plugin catalog

Before/After captures of the Agents settings page for slice S2 of issue `q-10384744`. Both sides use the same route,
viewport, theme, locale and seeded state; only the built `dsh-superagent` differs.

## Revisions

- **Before**: S1 as merged, `d74d21bf` (per-role plugin switches; no custom plugin add/delete), in `main` at
  `6ed55d10`.
- **After**: the S2 ticket commit `0c3da4d6`, which is `main` `6ed55d10` plus the custom plugin catalog.
- The final evidence commit may sit on a later head; the code under capture is the S2 commit named above, and the
  captures below are only added by this commit.

## Build

```sh
git archive d74d21bf | tar -x -C /tmp/s2-before-src
git archive 0c3da4d6 | tar -x -C /tmp/s2-after-src
(cd /tmp/s2-before-src && pnpm build)
(cd /tmp/s2-after-src && pnpm build)
```

Both builds completed with exit 0. Each source tree reused the ticket worktree's installed `node_modules` through a
symlink, as no dependency changed.

## Capture setup

- DSH profiles `s2-before` (port 3163) and `s2-after` (port 3164) are copies of the existing `c4plugins-after` profile,
  with `dsh-superagent` linked to the Before and After builds and `webserver` bound to `10.126.126.6`.
- Each state directory is a copy of the proven `c4plugins-after` state (a GitHub chain to
  `cinvymoe/dsh-superagent-prototype` and the setup stub `gh`); the copied `master-id` key was removed so each state
  starts its own master Session. The before and after states open the same schema-11 seed and migrate it with their own
  build. No credentials or private Feishu content are in the captures.
- Started with `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open`
  and the token URL from its log.
- Browser: `/usr/bin/chromium` via Playwright, viewport 1440x1800, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`; the route `settings/agents` was set in `sessionStorage['dsh-superagent/route']`, then
  the **Superagent** sidebar panel was opened and `#dt-page` scrolled to the top.
- The suggestions come from the profile's real host tools: the `magpie` MCP server (`mcp__magpie__*`), the
  `feature_exec_*`, `team_task_*` families and the ungrouped host tools.

## Shots

- `before-agents.png` — S1 baseline: the built-in plugin switches only; the page has no custom plugin section and no
  **添加插件** button.
- `after-agents.png` — the same page with the **自定义插件** catalog above the role cards, **添加插件**, and the empty
  catalog copy.
- `after-add-dialog.png` — the **添加自定义插件** dialog: name, the three role switches (all on), the **建议分组**
  (`magpie` MCP server, `feature_exec` and `team_task` tool families) and the per-tool list.
- `after-add-dialog-filled.png` — after **使用这组** on `magpie`: the name is prefilled and the group's tools are
  selected; the same capture shows the ungrouped tools can still be added one by one.
- `after-plugin-added.png` — after confirming **添加**, enabling `magpie` on the main Session and saving + reloading:
  the custom row shows its role scope and tools, and the main Session's plugin list has `magpie` switched on. The
  reload proves the catalog is stored in the `agents` block.
