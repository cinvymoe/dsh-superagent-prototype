# C4 · Aligner 开关的面板与运行状态 — Before / After

These captures compare the same Superagent state under two builds: the deployment baseline before this slice, and this
ticket branch. Both use the same seeded state directory, route, viewport, locale, theme and time zone; only the built
`dsh-superagent` differs. They show the Agent settings cards, the Overview's Executor figures, the Agent settings history
and the discussion hand-off button.

## Revisions

- **Before**: deployment `main` @ `4abe30a` (the merge of PR #78, C3's runtime gate; the Agent settings still had no role
  switch and `GET state` carried no per-role state).
- **After**: this ticket's branch `agent/aligner-dbed9031a5f8` built from this worktree (schema 14 unchanged; the panel
  switch, per-role `GET state`, shared Aligner figure, role history codes and disabled hand-off).

Both builds completed with exit 0.

## Build

```sh
# Before
git archive 4abe30a | tar -x -C /tmp/aligner-c4-before-src
cd /tmp/aligner-c4-before-src && pnpm build

# After (this worktree)
cd /data/project/workspace/superagent/aligner-dbed9031a5f8 && pnpm build
```

## Capture setup

- DSH profiles `aligner-c4-before` and `aligner-c4-after` are copies of the existing `c4-after` profile, each with
  `dsh-superagent` linked to its build and the same base bundles; `webserver` listens on `10.126.126.6:3171` and `:3172`.
- Each state directory is a copy of the same `c4-after` seed (GitHub chain, one project and its requirements), with
  `master-id` removed so each side starts its own master Session. The seeded settings are identical on both sides.
- For the hand-off shots, the same discussion record (`d-aligner-off`, linked to a seeded requirement, with one answered
  conclusion) and its Thread row were inserted into both state copies. On the After side the Aligner was then switched off
  through the panel and saved; the Before side cannot store that switch and stays on.
- Started with `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open`
  and the token URL from its log.
- Browser: `/usr/bin/chromium` via Playwright; viewport 1440×1800, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`, device scale 1. The capture opened **Superagent** in the sidebar, then the tab and card
  named in each shot.
- The two servers were stopped after the capture; tokens are not recorded. No credentials, private Feishu content or
  Session transcripts are in the captures.

## Shots

- `before-agents.png` / `after-agents.png` — the same Settings › Agents first viewport. Before goes straight from the
  custom-plugin catalog to **角色模型**; After adds a **状态** block to every card: the three infrastructure roles say
  **基础设施** and offer no switch, and the Aligner's card (below) carries the switch.
- `before-main-card.png` / `after-main-card.png` — the Main Session card. After names it infrastructure; Before has no
  status block.
- `before-aligner-card.png` / `after-aligner-card.png` — the Aligner card. After adds **状态 › 启用** and
  **当前并发 › 对齐会话 0 / 2**; Before has neither.
- `after-aligner-off.png` — the same Aligner card after the switch was turned off and saved: the switch is off and the
  card still reports the pool's `0 / 2`.
- `before-overview.png` / `after-overview.png` — Overview. After adds `Aligner 开 · 0 / 2` beside `执行中 0 / 3`; worker
  load does not count an aligner.
- `after-agents-history.png` — Settings › Agents history after that save: **第 4 次保存 · 管理页 / 停用智能体：Aligner**,
  the role's localized name rather than a plugin id.
- `before-handoff-panel.png` / `after-handoff-panel.png` — one discussion's conclusion panel. Before offers the enabled
  **交给对齐** button (the Aligner is on); After disables it and states **Aligner 已在「设置 › 智能体」关闭，交给对齐暂不可用；
  打开后再交。**. A forced request is still refused with 409 `roleDisabled`, covered by `tests/aligner-gate.spec.ts`.

## Verification

`env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM pnpm check` (typecheck, the full Vitest suite and the tsdown build)
passed on the After tree: 80 files / 1665 tests, build complete. The worker shell exports `GIT_CONFIG_GLOBAL` for its own
git isolation; the two `tests/runtime.spec.ts` cases that assert the host process keeps that variable unset fail only
under that exported value, on the baseline too, so the gate was run without it.
