# Task contract · C2 retry · Discuss form and API expose the project worktree root

Ticket: `1478bf96058ac87a5dcf08731cb9147b` (slice C2 of alignment `q-94e6e32e`)
Worktree: `/root/.dsh/state/superagent-test/work/discuss-api-worktree-1478bf96058a`
Baseline: branch `agent/discuss-api-worktree-1478bf96058a` already merged deployment main `310ae2e` (`0546322`); the tree equals `310ae2e`.

## Goal

C2's production behavior is already on the integration base. Lock the frozen acceptance criteria at both boundaries — HTTP and jsdom — without changing production code. Only tests and the test fixture change.

## Edits

1. `tests/local-align.spec.ts` — in `it('accepts an optional absolute worktree root over HTTP and refuses a relative one', ...)`, add after the existing empty-string case:
   - `POST local/projects` with no `worktreeRoot` → 200 and the response project has no `worktreeRoot`.
   - `POST local/projects` with `worktreeRoot: '   '` → 200 and no `worktreeRoot` (route trims; frozen decision 4 says whitespace is unconfigured).
   - After the legacy project is created, assert its entry in `GET local/projects` has no `worktreeRoot` and the response is still 200.
   Keep the existing relative-path assertions (400, `code: projectWorktreeRoot`, `error` contains `absolute path`) and the persistence/detail assertions unchanged.

2. `tests/fixtures/panel-server.ts` — make `POST local/projects` mirror the host's refusal: if a non-empty `body.worktreeRoot` does not start with `/`, return `refuse(400, 'A project worktree root must be an absolute path', { code: 'projectWorktreeRoot' })`; otherwise keep the current project construction.

3. `tests/panel-discuss.spec.tsx` — add three jsdom tests:
   - A whitespace-only worktree root (`'   '`) submits `{ name, repository }` with no `worktreeRoot` property.
   - A requirement-detail route (`at({ page: 'discuss', id: 'q-fixture' })`) with a project carrying `worktreeRoot: '/srv/worktrees'` shows `项目：Widgets · acme/widgets · /srv/worktrees`.
   - A legacy project without `worktreeRoot` renders the detail project line without a trailing path.
   - A relative root (`'relative/root'`) on the create form triggers the refusal and the toast (`role="status"` or `.dt-toast`) shows the Chinese `userError.projectWorktreeRoot` copy; the project is not created.
   Reuse the existing `input`, `PROJECT`, `localIssue`, `at`, `mount`, `click`, `type`, `text` helpers.

## Do not

- Do not edit `src/**` (production behavior already satisfies the criteria).
- Do not touch `src/app/local.ts` (C1 retry owns the blank semantics).
- Do not weaken or reword existing assertions.
- Do not add new test files; `docs/007`'s test table must not need an update.

## Acceptance

All six frozen C2 criteria remain satisfied and now have explicit regression coverage at the HTTP and jsdom boundaries:
1. POST with `/srv/wt` persists; omitted/empty/whitespace = unconfigured; relative = 400 with an absolute-path explanation.
2. GET list and issue detail return the field; legacy records valid in both.
3. Discuss form submits only a non-empty root; project row displays it; zh/en copy complete.
4. Execution root hint contains “显式配置时必须已存在且可写”.
5. jsdom and HTTP tests cover the above; `pnpm check` passes.
6. PR visual evidence handled by the worker with the existing real captures.

## Verify

```
pnpm typecheck
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/panel-discuss.spec.tsx tests/panel-execution.spec.tsx tests/locales.spec.ts tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

## Report

Report the exact files changed, the test command output summary (files/tests passed), and any assertion that had to be adjusted. Do not commit; the worker commits after review.