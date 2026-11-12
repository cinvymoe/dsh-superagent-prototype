# Test environment prerequisites

No physical device or cross-build is involved: this is a Node + jsdom panel case with a browser-GUI screenshot step.

## Toolchain

- Node `v22.23.1`, pnpm `11.7.0` (`pnpm install --frozen-lockfile`; the shared store makes it a sub-second install).
- vitest `4.1.8`, TypeScript `6.0.3`, jsdom `29.1.1` as pinned by `package.json` / `pnpm-lock.yaml`.
- `node:sqlite` experimental warnings are expected in the spec output.

## Commands

```sh
pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts   # targeted: 2 files / 29 tests
pnpm typecheck                                                       # tsc --noEmit, exit 0
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check                                                     # no output
```

The `env -u …` prefix removes the injected git identity/locale that otherwise makes host-sensitive specs fail in the worker environment; it is the documented full-suite command in this repository.

## Panel captures

- Two isolated DSH profiles, `c4-before` and `c4-after`, copied from the `c3-after` skeleton: `package.json` links `dsh-superagent` to the built tree, `cordis.patch.yml` sets port 3117/3118 and state dirs `/root/.dsh/state/c4-before` / `c4-after`.
- `c4-before` links to a detached worktree at `/tmp/c4-before` (`git worktree add --detach /tmp/c4-before bee00110`, then `pnpm install --frozen-lockfile && pnpm build`); `c4-after` links to the ticket worktree after `pnpm build`.
- Start with `node /root/.bun/bin/dsh --profile <name> --no-open`; the printed `?token=…` URL changes when the state dir is recreated, so re-read it from the log after every restart.
- Seed through the management API with `x-orchestrator-request: 1`: first `PUT settings/source:github` naming a real repository chain (the save validates the agent CLI and repository access through `gh`), wait for the internal restart, `POST executor/pause {paused:true}`, then create the project, the three requirements and their proposed alignments, `POST local/issues/:id/execution {mode:'feature-exec'}` for the second, and finally confirm the third so it dispatches two Tickets that stay queued.
- Playwright Python drives `/usr/bin/chromium --no-sandbox` at a 1440×1100 viewport, locale `zh-CN`, `color_scheme='light'`. Navigation: open the printed URL, write `sessionStorage['dsh-superagent/route'] = {route, stack, project}`, reload, then click the sidebar `Superagent` entry.
- Captures are clipped to the panel content (`x=280, width=1160`) on both sides so the unrelated DSH session sidebar does not differ between the two profiles.

## Evidence paths

`docs/evidence/c4-execution-mode/{before,after}-*.png`; logs under `docs/issues/evidence/c4-execution-mode-*.log`.

## Notes

- A fresh state dir requires the GitHub Source block to be saved twice: the first save returns `restarting: true` and the orchestrator is briefly unavailable, while a second save with the same revision answers `409 Settings changed`, which means the block is already stored. Wait for `GET local/projects` to answer before seeding.
- If seeding races the restart, a requirement row can exist without its Thread (`GET local/issues/<id>` → “Local issue thread not found”); delete the orphan `local-issue:<id>` row in `orchestrator.sqlite` instead of trying to repair it through the API.
