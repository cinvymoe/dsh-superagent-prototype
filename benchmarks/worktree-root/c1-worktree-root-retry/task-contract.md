# Task contract — C1 retry

## Goal

`createProject` in `src/app/local.ts`:

- `worktreeRoot === undefined`, `''`, or whitespace-only after `trim()` → unconfigured; the stored record has no `worktreeRoot` field;
- any other value is trimmed and must be absolute, otherwise `UserError('projectWorktreeRoot')` (message: `A project worktree root must be an absolute path`);
- existence and writability stay launch-time checks, not project-creation checks.

Tests: update `tests/local.spec.ts` worktree-root test to treat whitespace-only as unconfigured and keep relative-path errors; add the end-to-end HTTP whitespace case in `tests/local-align.spec.ts`. Do not weaken the inherited `project worktree roots` block.

## Constraints

- Only `src/app/local.ts`, `tests/local.spec.ts`, `tests/local-align.spec.ts`.
- No product docs, client/UI, HTTP schema, dependencies, or unrelated refactors.
- Do not commit, push, or open a PR from the implementation lane.

## Verification

- `pnpm typecheck`
- `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/runtime-concurrency.spec.ts tests/locales.spec.ts`
- `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm test`
