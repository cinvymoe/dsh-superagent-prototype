# Task contract · C2 · 需求侧执行模式存储、修改接口与派发传递

Ticket: `5e9fa76642ab9972e1b7b557716ae657` (slice C2 of alignment `q-2f92c878`)
Worktree: `/data/project/workspace/dsh-worktrees/slice-5e9fa76642ab`
Baseline: branch `agent/slice-5e9fa76642ab`, which already merged C1 (`agent/ticket-a6e2430d5e8f`, merge `65f669e1`); C1's
`ExecutionMode` / `ExecutionStrategy` / `EXECUTION_STRATEGY_REVISION` / `DEFAULT_EXECUTION_STRATEGY` and
`Engine.acceptPlan({ execution })` / `Ticket.plan.execution` are available in the tree.

## Goal

A local requirement records the execution mode it will run under, `native` by default; a new management API changes it
before dispatch; a confirmed alignment dispatches every slice ticket pinned to the requirement's current mode. A
requirement that already dispatched tickets refuses the change and keeps its record.

## Edits

1. `src/sources/local-format.ts`
   - `import type { ExecutionMode } from '../core/model.ts'`.
   - `LocalIssue.execution?: ExecutionMode` — absent on legacy records and means native.
   - Export `requirementExecutionMode(issue: Pick<LocalIssue, 'execution'>): ExecutionMode` returning
     `issue.execution ?? 'native'` (mirrors `projectRepositories`).

2. `src/app/local.ts`
   - Import `EXECUTION_STRATEGY_REVISION` and the types (`ExecutionMode`, `ExecutionStrategy`) from `../core/index.ts`, and
     `requirementExecutionMode` from `../sources/local-format.ts`.
   - Private `dispatched(id: string): boolean` → `this.host.store.tickets.list().some(ticket => ticket.plan?.issueId === id)`.
   - `setExecution(id: string, mode: string): LocalIssue | undefined`:
     unknown issue → `undefined`; `mode` not `native`/`feature-exec` → `throw new UserError('executionMode')`;
     `dispatched(id)` → `throw new UserError('executionLocked')` (record untouched); otherwise store
     `{ ...issue, execution: mode, updatedAt: this.clock() }` and return it (same mode included: the write is idempotent,
     but a dispatched requirement is still refused before this check).
   - `planInput(id)` returns `execution: ExecutionStrategy` in addition to `thread`/`triggerIds`/`actor`, computed as
     `{ mode: requirementExecutionMode(issue), version: EXECUTION_STRATEGY_REVISION }`.

3. `src/app/runtime.ts`
   - `dispatchPlan` passes the plan input's `execution` to `engine.acceptPlan` (`execution: input.execution`).

4. `src/app/http.ts`
   - Route `'POST local/issues/:id/execution'`: body `z.object({ mode: z.string() })`, call
     `runtime.local.setExecution(params.id, input.mode)`, `undefined` → `RouteError(404, 'Local issue not found')`,
     else `{ issue }`. Domain errors surface through `failure()` as 400 with `code` (`executionMode` /
     `executionLocked`) — do not duplicate validation in the route.

5. `src/app/api.ts`
   - `'POST local/issues/:id/execution': { body: { mode: ExecutionMode }; response: { issue: LocalIssue } }` with
     `import type { ExecutionMode } from '../core/model.ts'`.

6. `src/core/errors.ts`
   - `executionMode: ['refused', 'Execution mode must be native or feature-exec']`
   - `executionLocked: ['refused', 'A requirement that has dispatched tickets keeps its execution mode']`

7. `src/client/locales.ts`
   - `'userError.executionMode': ['执行模式必须是 native 或 feature-exec。', 'Execution mode must be native or feature-exec.']`
   - `'userError.executionLocked': ['需求已有派发工单，执行模式不可再修改。', 'A requirement that has dispatched tickets keeps its execution mode.']`
   - Nothing else in this file: the Discuss switch and its labels belong to C4.

8. Tests
   - `tests/local.spec.ts` (unit, existing `setup()`): a new requirement has no `execution`, `requirementExecutionMode`
     is `native`, `setExecution('feature-exec')` persists and reads back `feature-exec`, setting `native` again works; an
     unknown mode throws the `executionMode` message and leaves the record unchanged. Optionally lock the unit case with a
     minimal saved ticket (`{ id: 't-lock', plan: { issueId: issue.id, sliceId: 'C1' } } as unknown as Ticket`).
   - `tests/local-align.spec.ts` (HTTP, existing `h`/`project`):
     a. `POST local/issues` then `GET local/issues/:id` → `requirementExecutionMode(issue)` is `native` and
        `issue.execution` stays absent.
     b. `POST local/issues/:id/execution { mode: 'feature-exec' }` → 200, response issue and a fresh GET both carry
        `execution: 'feature-exec'`.
     c. `POST … { mode: 'sometimes' }` → 400 `{ code: 'executionMode' }`, record still `feature-exec`.
     d. Proposal + `feature-exec` + confirm → every ticket with `plan.issueId === issue.id` has
        `plan.execution` equal to `{ mode: 'feature-exec', version: EXECUTION_STRATEGY_REVISION }` (import the constant
        from `../src/core/index.ts`).
     e. On that dispatched requirement, `POST … { mode: 'native' }` → 400 `{ code: 'executionLocked' }` and a fresh GET
        still returns `feature-exec`.
     f. A second requirement left without the field, proposed and confirmed → its tickets pin
        `{ mode: 'native', version: EXECUTION_STRATEGY_REVISION }` (legacy/no-field dispatch).
   - Keep every existing assertion intact; reuse the existing helpers (`h.api`, `slices`, `firstTrigger`).

9. Evidence
   - Save command logs under `docs/issues/evidence/c2-execution-mode-targeted.log`,
     `c2-execution-mode-typecheck.log`, `c2-execution-mode-regression.log` and `c2-execution-mode-check.log`.
   - Do not edit `docs/issues/5e9fa76642ab.md`, `docs/003-execution.md`, `docs/005-panel.md`, `docs/007-architecture.md`
     (C5/C4 own those); do not touch `src/client/discuss.tsx`.

## TDD

- Red first: add the new unit + HTTP assertions and run
  `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts`, capturing the failure.
- Green: implement 1–7 until both files pass.
- Refactor: keep naming/style consistent with the existing LocalIssues helpers; rerun.

## Verify

```
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts
pnpm typecheck
pnpm vitest run tests/locales.spec.ts tests/core-engine.spec.ts tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

## Do not

- Do not change `src/core/model.ts`, `src/core/ports.ts`, `src/core/evals.ts` or `src/core/engine.ts` (C1 owns them).
- Do not add a requirement-wide "execution" default setting, a project-level default, or per-slice modes.
- Do not rewrite `plan.execution` after tickets exist, and do not migrate legacy records in bulk.
- Do not commit, push or open a pull request; leave the working tree changes and the evidence logs for the parent.
- Do not restart or reconfigure the running DSH service.

## Report

Return: files changed, the red and green command outputs (paths to the evidence logs), the final `pnpm check` result,
`git diff --check`, and anything that deviates from this contract.
