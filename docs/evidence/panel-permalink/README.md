# Panel permalink and the header's new-tab link

Before/After captures for the panel's address-bar permalinks and the page header's link. Both sides use the same route,
viewport, theme, locale, time zone and the same seeded Superagent state (one project `Widgets` with four requirements,
one of them opened); only the built `dsh-superagent` differs.

## Revisions

- **Before**: deployment `main` @ `109db2e7` (the panel keeps its route only in `sessionStorage` and the header has no
  link), built from a `git archive` of that commit in `/tmp/permalink-before-src`.
- **After**: this ticket's branch `agent/permalink-61a6d806a28d` (permalink parameters in the address bar and the
  header's **在新页面打开** link), built from the ticket worktree
  `/data/project/workspace/superagent/permalink-61a6d806a28d`.

## Build

```sh
# Before
mkdir -p /tmp/permalink-before-src
git archive 109db2e7 | tar -x -C /tmp/permalink-before-src
cd /tmp/permalink-before-src && pnpm install --frozen-lockfile && pnpm build

# After (ticket worktree)
cd /data/project/workspace/superagent/permalink-61a6d806a28d && pnpm build
```

Both builds completed with exit 0.

## Capture setup

- DSH profiles `permalink-before` and `permalink-after` are copies of the proven `discussion-delete-*` profiles, with
  `dsh-superagent` linked to the Before build and to the After worktree, and `webserver` on 10.126.126.6:3171 and 3172.
- Each state directory is a copy of the `discussion-delete-after` state (the GitHub chain to
  `cinvymoe/dsh-superagent-prototype` and one project `Widgets` with its requirements), with `master-id` removed so each
  side starts its own master Session and keeps the same seeded records.
- Started with `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open`.
- Browser: `/usr/bin/chromium` via Playwright; viewport 1440x1100, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`, device scale 1. Captures are clipped to the panel (`x=280`, width 1160).
- Both sides open **Superagent** in the sidebar, the **需求列表** tab, the **全部** filter and the first requirement.

## Shots

- `before-list.png` / `after-list.png` — the Requirements list with the **全部** filter and the `Widgets` project. The
  After address bar holds `?panel=dsh-superagent&page=requirements&filter=all`; the Before address bar stays `/`.
- `before-detail.png` / `after-detail.png` — the same requirement detail. On After the address bar holds
  `?panel=dsh-superagent&page=requirements&id=q-ca0fea2e&filter=all` and the header's link points at exactly that URL.
- `before-header.png` / `after-header.png` — the page header alone: search, glossary, **打开主 Session** only on Before;
  the new-tab icon (aria-label **在新页面打开**, `target="_blank"`, `rel="noopener noreferrer"`) added at the right on After.
- `after-permalink-newtab.png` — the permalink opened in a second tab: the sidebar selects Superagent (`aria-current="page"`),
  the **需求列表** tab, the `Widgets` project and the same requirement detail appear, and the address bar carries no token.

## Checks recorded by the capture

- The After header link equals the address bar's URL; neither contains `token=`.
- Clicking another sidebar panel clears the panel parameters from the address bar, and a reload there shows the shell
  without Superagent, as before this change.
- The Before header exposes no link (`headerLink: null`); the After header has the one link and no copy or share control.
