# T1 task contract

- Run: `run-mwdm5xtw-1` (execute, policy A1), issue `q-2f92c878:C1`, task `T1` / tier T1 / lane full
- Worktree: `/data/project/workspace/dsh-worktrees/ticket-a6e2430d5e8f` (branch `agent/ticket-a6e2430d5e8f`)
- Dispatched lanes: `lane-T1-1`, `lane-T1-2` (subagent spawn; both failed before any tree change, so the worker implemented the task directly)

## Goal

Add a pinned execution-strategy field to confirmed-plan slice tickets and fix it in `Engine.acceptPlan`: new slice tickets store `plan.execution = input.execution ?? { mode: 'native', version: 'execution-v1' }`; a repeated confirmation reuses the existing ticket and never rewrites the pinned strategy. Core contract only — strategy resolution, sessions/prompts, local-requirement storage and the panel are later slices.

## Files

- `src/core/model.ts` — `ExecutionMode`, `EXECUTION_STRATEGY_REVISION`, `ExecutionStrategy`, `DEFAULT_EXECUTION_STRATEGY`, `Ticket.plan.execution?`
- `src/core/ports.ts` — `AssessmentOutcome` accept `plan.execution?`
- `src/core/evals.ts` — `Evals.acceptPlan` optional `execution`, default native, reuse untouched
- `src/core/engine.ts` — `Engine.acceptPlan` pass-through
- `tests/core-engine.spec.ts` — default, explicit native, explicit feature-exec, repeated confirmation

## Acceptance

- Explicit `{mode:'native', version:'execution-v1'}` pins every new slice ticket to it.
- Missing `execution` pins `{mode:'native', version:'execution-v1'}`.
- A repeated confirmation reuses ticket ids and keeps the first pinned mode.
- `pnpm vitest run tests/core-engine.spec.ts` and `pnpm typecheck` pass.

## Constraints

No `src/app`, `src/client`, `prompts`, docs or schema changes; repository TypeScript style; no unrelated files touched.
