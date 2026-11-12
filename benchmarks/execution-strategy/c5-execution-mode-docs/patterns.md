# Reusable patterns

## Write the canonical semantics once, then mirror only the surface

- `docs/003-execution.md` owns the execution-strategy contract: modes, switch, pinning, policy-version exclusion, immutability, legacy resolution, host degradation.
- `docs/002-authorization.md` states only the exclusion from the Policy version. Numbered docs may link only to earlier ones, so `002` cannot link `003`; phrase the exclusion without a link.
- `docs/005-panel.md` repeats only what the panel shows (switch, default, row tag, locked tag), not the strategy resolution.
- `docs/007-architecture.md` is the code index: it names where `plan.execution` is stored, resolved and used, and updates only descriptions of existing rows.

## Keep the two legacy directions apart

A legacy **requirement record** without `execution` dispatches `native`; a legacy **Ticket** without `plan.execution` resolves as `feature-exec`, because it was dispatched when feature-exec was the only flow. State both explicitly, in different sentences, or a reader will collapse them into one wrong rule.

## Check the docs test rules before writing

`tests/docs.spec.ts` enforces: consecutive numbering from 000; links from a numbered doc only to earlier numbered docs; every local link resolves; no conflict markers; the 007 Modules table lists every `src` file and only existing ones; the Tests table lists every `*.spec.ts(x)` and only existing ones; plus the exact prose assertions of earlier features. Read that spec first, and let table rows follow the worktree, not the plan.

## A documentation slice that runs while its implementation slices merge

The branch may start before the implementation PRs merge. Merge `main` when it advances, and resolve doc-table conflicts by keeping both sides rather than picking one: the incoming side may carry a new UI row or timeline sentence that `docs.spec.ts` later asserts verbatim. Re-run the full check after the merge; count changes are expected.

## Documentation-only slices still need an acceptance-shaped review

Map each frozen semantic to a quoted sentence and its file, rather than saying "documented". The review table caught four wording drifts that a generic "docs look good" review would have missed.
