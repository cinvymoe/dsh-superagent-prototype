# T1 task contract

- Run: `run-mwdn6uki-4` (execute, policy A1), issue `q-2f92c878:C2`, task `T1` / tier T1 / lane full
- Worktree: `/data/project/workspace/dsh-worktrees/slice-5e9fa76642ab` (branch `agent/slice-5e9fa76642ab`, C1 merged as `86a9f3ee`)
- Dispatched lanes: `lane-T1-1` (spawn), `lane-T1-2` (spawn, explicit model), `lane-T1-3` (fork); all three failed before any tree change, so the worker implemented the task directly under this contract
- Full contract: `docs/issues/task-contract-5e9fa76642ab.md`

## Goal

A local requirement records the execution mode its slice tickets run under (`native` by default, `feature-exec` when chosen through `POST local/issues/:id/execution`), the mode is fixed once the requirement has dispatched tickets, and confirming the alignment propagates the current mode into every dispatched Ticket's `plan.execution` as `{ mode, version: EXECUTION_STRATEGY_REVISION }`; a requirement without the field dispatches native.

## Files

- `src/sources/local-format.ts` — `LocalIssue.execution?`, `requirementExecutionMode`
- `src/app/local.ts` — `executionStrategy`, `setExecution` (validation + dispatched refusal), `planInput.execution`
- `src/app/runtime.ts` — `dispatchPlan` passes `execution` to `Engine.acceptPlan`
- `src/app/http.ts` — `POST local/issues/:id/execution`
- `src/app/api.ts` — the route type contract
- `src/core/errors.ts`, `src/client/locales.ts` — `executionMode`, `executionLocked` and their zh/en text
- `tests/local.spec.ts`, `tests/local-align.spec.ts` — unit and HTTP coverage
- `tests/fixtures/panel-server.ts` — mirror of the route and the post-dispatch read-only refusal

## Acceptance

- A new requirement reports native through `requirementExecutionMode` and stores no field; `POST …/execution { mode: 'feature-exec' }` returns 200 and a fresh `GET local/issues/:id` returns `feature-exec`.
- An unknown mode returns 400 `code: 'executionMode'` and the record is unchanged.
- After a confirmed alignment dispatched tickets, the route returns 400 `code: 'executionLocked'` and the record keeps its mode.
- Every dispatched ticket's `plan.execution` equals `{ mode: <requirement mode>, version: EXECUTION_STRATEGY_REVISION }`; a requirement without the field pins `native`.
- `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts` and `pnpm typecheck` pass; the locales parity spec still passes.

## Constraints

No `src/core/model.ts` / `ports.ts` / `evals.ts` / `engine.ts` edits (C1 owns them), no `src/client/discuss.tsx` switch (C4), no product-doc edits (C5), no bulk migration of legacy records, no post-dispatch rewrite of `plan.execution`.
