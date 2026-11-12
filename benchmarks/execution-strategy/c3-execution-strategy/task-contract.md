# T1 task contract

- Run: `run-mwdmwka6-3` (execute, policy A1), issue `q-2f92c878:C3`, task `T1` / tier T1 / lane full
- Worktree: `/data/project/workspace/dsh-worktrees/seam-session-b81d294563cb` (branch `agent/seam-session-b81d294563cb`)
- Dispatched lane: `lane-T1-1` (subagent spawn; it failed before any tree change, so the worker implemented the task directly)

## Goal

Resolve a slice Ticket's execution strategy from `plan.execution = { mode, version }` (pinned by C1) and drive the worker from it: the execution tools, the `feature_exec_start` pre-run guard and the execute handoff. A ticket without the field (dispatched before C1) resolves to feature-exec; a host without the `featureExec` service degrades to native.

## Files

- `src/app/execution-strategy.ts` — the registry by contract version and mode, `resolveExecutionStrategy`, `ExecutionServices`, `ResolvedExecutionStrategy`
- `src/app/sessions.ts` — `workOnly` (tools + guard) and the prompt-section callback read the resolved strategy; `EXECUTE_TOOLS` moved out
- `src/app/prompts.ts` — `composeExecute(config, mode = 'feature-exec', variables?)`
- `src/app/context.ts` — `nativeExecutePrompt`
- `prompts/native-execute.md` — the native handoff (implement directly, no re-decomposition, same PR delivery)
- `tests/execution-strategy.spec.ts`, `tests/prompts.spec.ts`
- `docs/007-architecture.md` — Modules/Tests rows for the new files

## Acceptance

- native: allow set without any `feature_exec_*`, no pre-run guard, prompt without `feature_exec_start` and stating direct implementation / no re-decomposition / PR delivery;
- feature-exec: tools, guard and prompt identical to before;
- legacy `plan.execution` missing → feature-exec;
- no `featureExec` service → native degradation, no `feature_exec_start` prompt or guard;
- `pnpm vitest run tests/execution-strategy.spec.ts tests/prompts.spec.ts` and `pnpm typecheck` pass.

## Constraints

No core model, schema, HTTP or panel changes; reuse the C1 types; docs prose stays with C5; repository TypeScript style; no unrelated files touched.
