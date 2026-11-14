# Agents panel — plugin switches

Before/After captures for the Agents settings page. Both use the same route, viewport, theme, locale, time zone and seeded
Superagent state; only the built `dsh-superagent` differs.

## Revisions

- **Before**: deployment `main` @ `be7976af` (the C4 panel with per-tool switches and a per-tool plugin-tool add/remove
  list, and the schema 11 settings block).
- **After**: this ticket's branch, built from the worktree `agent-72a134399a8f` (schema 12, shared plugin catalog and
  per-role plugin switches).

## Build

```sh
# Before
git archive be7976af | tar -x -C /tmp/agentplugins-before-src
cd /tmp/agentplugins-before-src && pnpm install --frozen-lockfile && pnpm build

# After (ticket worktree)
cd /data/project/workspace/rust-crane-worktrees/agent-72a134399a8f && pnpm install --frozen-lockfile && pnpm build
```

Both builds completed with exit 0.

## Capture setup

- DSH profiles `agentplugins-before` and `agentplugins-after` are copies of the proven `c4plugins-after` profile (base/web
  bundles plus `dsh-feature-exec`), with `dsh-superagent` linked to the Before build and the After worktree, and `webserver`
  on 10.126.126.6:3155 and 3156.
- Each state directory is a copy of the `c4plugins-after` state (the GitHub chain to `cinvymoe/dsh-superagent-prototype`
  and its stub `gh`), with `master-id` removed so each side starts its own master Session. The Superagent settings, policy and
  Sources are therefore the same seed on both sides; the DSH sidebar's workspace label comes from the shared DSH workspace
  registry, not from this plugin's state.
- Started with `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open` and
  the token URL from its log.
- Browser: `/usr/bin/chromium` via Playwright; viewport 1440x1800, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`, device scale 1. The capture opened **Superagent** in the sidebar, then **设置 › 智能体**, and
  scrolled `#dt-page` to the top. The card captures below are element screenshots of the same page and state.

## Shots

- `before-agents.png` / `after-agents.png` — the same first viewport. Before shows **工具目录** with one switch per required
  or optional tool plus **插件提供的工具** with 20 addable tools for the main Session; After shows read-only **必需工具** and
  **插件** switches for the main Session and the aligner, with each plugin's tools and a host-unavailable marker.
- `before-main-card.png` / `after-main-card.png` — the main Session card alone: per-tool catalog and the addable list
  versus required tools and the `image` and `billion-context` plugin switches.
- `before-executor-card.png` / `after-executor-card.png` — the executor card alone: required and optional tool switches plus
  the addable list versus required tools and the `image`, `web`, `skills`, `todo` and `subagents` plugin switches.

No credentials, private Feishu content or Session transcripts are in the captures.
