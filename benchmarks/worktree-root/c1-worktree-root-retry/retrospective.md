# Retrospective — C1 retry

## What happened

1. The worktree seed (`5556291`) already contained the full C1 implementation from the stopped prior ticket (`2e79202`): project `worktreeRoot` resolution, `Execution.worktreeRoot` persistence, pre-launch existence/directory/writability validation with a write probe, `PrepareFailed` without automatic retry, retry and human-message recovery, and directory stability.
2. Comparing the inherited code with the retry alignment found exactly one gap: `createProject` tested `worktreeRoot === ''` before trimming, so a whitespace-only value became `''` and then failed `isAbsolute` with `projectWorktreeRoot`. The old test even locked that wrong behavior. The retry alignment explicitly says whitespace-only is equivalent to unconfigured.
3. The implementation lane changed the normalization to trim first, treat blank as absent, and keep the relative-path error. Tests were changed red→green (1 failed / 19 passed before, 20/20 after), then the full suite passed.
4. The delivery branch was rebased from the local seed (`5556291`) to deployment `main` (`310ae2e`) so the PR diff contains only the retry delta and does not revert the already-merged C2/C3 slices.

## Pitfalls and fixes

- **Pitfall: testing emptiness before trimming.** `input.worktreeRoot === ''` misses `'   '`, which then fails the absolute-path check. Fix: `const trimmedRoot = input.worktreeRoot?.trim(); const worktreeRoot = trimmedRoot ? trimmedRoot : undefined` before `isAbsolute`.
- **Pitfall: keeping the old test as the specification.** The inherited test asserted `code('   ') === 'projectWorktreeRoot'`. A retry with a changed acceptance clause must update the test, not just the code; the test now asserts whitespace is unconfigured and moves the error assertion to a whitespace-padded relative path.
- **Pitfall: delivering from a stale seed.** A branch cut from the local seed lacks already-merged C2/C3 changes and a PR against deployment main would show/revert unrelated files. Fix: reapply the small diff onto `deployment/main` before committing, and re-run the full suite on that base.
- **Pitfall: independent review lanes hang in this runtime.** Two review subagents produced no output and were interrupted; the worker completed the two-axis review with explicit per-criterion evidence and recorded the runtime limitation.
- **Pitfall: environment-sensitive full suite.** Two pre-existing tests depend on host `GIT_CONFIG_GLOBAL` and localized git messages. Run the full suite as `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm test` and record the reason.

## Test environment three questions

1. Device/GUI/screenshot involved? No — pure logic and tests.
2. Rotation/direction conversion? None; not applicable.
3. Repeatable prerequisite? Yes: clean-env full-suite command is recorded in `environment.md`; no device baseline to upgrade.

## What would make it right first time

Read the frozen acceptance clause word by word against the inherited test names; when a retry changes a clause, change the old test that encodes the opposite behavior first, watch it fail, then fix the implementation.
