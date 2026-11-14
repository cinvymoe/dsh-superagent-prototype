# E — a project's missing GitHub chain is visible

Before/After captures for the requirement page head, the Overview's system problems and the project edit form. Both
sides use the same route, viewport, theme, locale, seeded state and scroll position; only the built `dsh-superagent`
differs.

## Revisions

- **Before**: deployment `main` @ `c69e32da`, the slice-start HEAD, built from `git archive origin/main` in
  `/tmp/echain-before-src`.
- **After**: this ticket branch (`agent/slice-8afcfc34f37a`), built in the ticket worktree.

## Scenario

The seeded state reproduces the current deployment shape:

- the GitHub Source holds only the `default` chain (`cinvymoe/dsh-superagent-prototype`; the setup probe is the
  `/tmp/c1bot-gh-default` stub, so no credentials appear);
- local project **superagent** (`p-0d3a3830`) names chain `p-0d3a3830`, which the Source no longer holds, so its
  Tickets execute with the default chain's identity;
- local project **rust_crane** (`p-bac24269`) names `default`, which the Source still holds and is unaffected;
- Feishu is off, and no private Feishu content is present.

Each side runs its own copy of the same seed (`/root/.dsh/state/echain-before-state` and
`/root/.dsh/state/echain-after-state`) because a state directory takes one process; `master-id` was removed so each
side starts its own main Session. Profiles `echain-before` (port 3171) and `echain-after` (port 3170) are copies of
the proven `c3bot-after` profile with the state directory and port changed and the bundle linked to the build above.

## Capture setup

- `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile echain-before|after --no-open`.
- Chromium via Playwright: viewport `1440x1100`, `locale='zh-CN'`, `color_scheme='light'`,
  `timezone_id='Asia/Shanghai'`; `#dt-page` scrolled to the top before every capture.
- Route: sidebar **Superagent** → **需求列表**, then **概览**, then **新建需求 → 编辑项目**.

## Shots

- `before-requirements-head.png` / `after-requirements-head.png` — the requirement page head of **superagent**.
  Before names only the repository chain; After adds the red hint naming chain `p-0d3a3830` and pointing to
  Sources → GitHub.
- `before-overview-problems.png` / `after-overview-problems.png` — the Overview system problems. After adds the
  read-only row **项目 superagent 的 GitHub 链路 p-0d3a3830 不在来源配置里** with the same guidance; the row only
  opens the Source settings and writes no setting. The unrelated GitHub poll error is produced by the setup probe's
  stub on both sides and is not part of this change.
- `before-edit-form.png` / `after-edit-form.png` — the project edit form for **superagent**. After adds the same
  hint above the form; the fields and values are unchanged.
