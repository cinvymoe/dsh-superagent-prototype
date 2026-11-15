# Discussion delete — confirmation, record, Thread and Answerer cleanup

Before/After captures for the Discussions detail page. Both sides use the same route, viewport, theme, locale, time zone
and the same seeded Superagent state (one project, one unlinked discussion with one follow-up, and one discussion that
already created its requirement); only the built `dsh-superagent` differs.

## Revisions

- **Before**: deployment `main` @ `031dc2e9` (the Discussions tab with Close discussion only, no delete action).
- **After**: this ticket's branch `agent/thread-d2d21f5c6879`, built from the ticket worktree
  `/data/project/workspace/superagent/thread-d2d21f5c6879` (Delete discussion with its confirmation dialog and the
  `DELETE local/discussions/:id` route).

## Build

```sh
# Before
mkdir -p /tmp/discussion-delete-before-src
git archive 031dc2e9 | tar -x -C /tmp/discussion-delete-before-src
cd /tmp/discussion-delete-before-src && pnpm build

# After (ticket worktree)
cd /data/project/workspace/superagent/thread-d2d21f5c6879 && pnpm build
```

Both builds completed with exit 0.

## Capture setup

- DSH profiles `discussion-delete-before` and `discussion-delete-after` are copies of the proven `c4-after` profile (base
  and web bundles plus `dsh-feature-exec`), with `dsh-superagent` linked to the Before build and to the After worktree,
  and `webserver` on 10.126.126.6:3161 and 3162.
- Each state directory is a copy of the `c4-after` state (the GitHub chain to `cinvymoe/dsh-superagent-prototype`), with
  `master-id` removed so each side starts its own master Session. The same seed script created the project and both
  discussions on each side, so the only difference between the two states is the built plugin.
- Started with `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open`
  and the token URL from its log.
- Browser: `/usr/bin/chromium` via Playwright; viewport 1440x1100, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`, device scale 1. Captures are clipped to the panel (`x=280`, width 1160) and open
  **Superagent** in the sidebar on route `discussions` / `discussions/:id`. No credentials or private content appear.

## Shots

- `before-discussion-detail.png` — the unlinked discussion detail: **创建 Issue** and **关闭讨论** only.
- `after-discussion-detail.png` — the same page and viewport with **删除讨论** added beside them.
- `before-detail-actions.png` / `after-detail-actions.png` — the action row alone, for the closest comparison.
- `after-delete-confirm-dialog.png` — clicking **删除讨论** opens the confirmation dialog naming the discussion's title
  (“确定删除讨论「清理过期的讨论」吗？…”), with **取消** and **确定**.
- `after-discussions-list-after-delete.png` — after confirming: the panel returns to the discussions list and the deleted
  row is gone, while the discussion that created a requirement stays.
- `before-linked-discussion-detail.png` / `after-linked-discussion-detail.png` — a discussion that already created its
  requirement shows **打开需求** and **关闭讨论** on both sides and no **删除讨论** on the After side.
- `before-discussions-list.png` / `after-discussions-list.png` — the list before any delete, identical on both sides.
