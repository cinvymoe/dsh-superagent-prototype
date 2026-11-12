# Test environment prerequisites

No physical device. Node 22 + pnpm 11.7.0 (repo), vitest 4 with jsdom for panel tests, and a headless Chromium for the real-panel captures.

## Unit / integration

```sh
pnpm install --frozen-lockfile
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

jsdom lacks `URL.createObjectURL` / `revokeObjectURL`; the panel spec stubs both in `beforeEach`.

## Panel captures

- Two isolated DSH profiles copied from the `superagent-test` profile, each in its own `DSH_HOME` to avoid the shared workspace session-index duplicate-id failure: `c3-before` links `/tmp/c3-before` (stack `fe2bb2e9`, built), `c3-after` links the ticket worktree (built), ports 3115/3116.
- Fresh state dirs `/root/.dsh/state/c3-before` and `/root/.dsh/state/c3-after`; seed through the management API with `x-orchestrator-request: 1`: one project Widgets and two requirements, one carrying a PNG and a JPEG.
- Delete every `orchestrator-capture` session dir that a previous aborted start left behind when the workspace plugin reports a duplicate session id; the same id in two project dirs blocks startup globally.
- Headless Chromium at `/usr/bin/chromium` via Playwright Python with `--no-sandbox`, viewport 1440×1100, locale zh-CN, light theme.
- Navigate: printed `?token=` URL → sidebar `Superagent` → project chip `Widgets` → tab. For the After form, `set_input_files` on the hidden picker with the two sample files.

## Evidence

`docs/evidence/c3-requirement-images/` — before/after × {new-requirement, requirements, detail}. Seed data is synthetic; no real ticket or private Feishu content.
