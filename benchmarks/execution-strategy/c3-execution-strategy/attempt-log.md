# Attempt log

1. `feature_exec_start` execute flow: e1 slice issue + frozen acceptance signed; e2 planned T1 and dispatched `lane-T1-1` (subagent spawn, cwd ticket worktree). The lane died before producing any change (`failed before it finished`, `git status` showed only the untracked slice doc).
2. Fell back to the worker implementing T1 in the ticket worktree — the planned file set, no scope expansion — as the assignment's own fallback when the lane backend is unavailable.
3. Implementation: the version-and-mode registry plus `resolveExecutionStrategy` with the legacy/unknown-version/host-service fallbacks; `Sessions.workOnly` and the prompt-section callback read the resolved strategy; `composeExecute` gained the mode parameter; `prompts/native-execute.md` added; `docs/007` Modules/Tests rows added.
4. First targeted run: one assertion expected `open the PR ...` while the handoff's third step begins `3. Open the PR ...`; fixed the assertion to the actual text.
5. During self-review, tightened the pre-run guard to `strategy.preRunGuard && allow.includes('feature_exec_start')`, exactly the pre-change condition: a host that registers the service but not its tools must not install a guard the worker cannot satisfy.
6. `pnpm typecheck` clean; targeted 2 files / 32 tests pass; `pnpm build` exit 0; full suite under the documented git-env cleanup: 64 files / 1301 tests pass. Without the cleanup the three known host-sensitive tests fail, as they do on the C1 baseline.
