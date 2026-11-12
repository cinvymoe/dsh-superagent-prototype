# Retrospective

## What went well

- The frozen criterion was narrow (one field, one default, idempotent reuse), so the diff stayed inside four core files and one test file; the review could map each AC to one assertion by name.
- Asserting the persisted ticket rather than the return value caught what the acceptance actually cares about: the pinned strategy of a reused ticket.
- Reproducing the 3 host failures from an archived baseline turned a scary red full suite into a documented environment limitation with a clean-env command that passes.

## Pitfalls

- **Subagent lanes can fail silently**: both spawn dispatches died with no closing message and no tree change. Check `git status` before assuming a lane did anything, and keep the fallback (worker implements directly) explicit in the dispatch evidence instead of pretending a lane succeeded.
- **`noUncheckedIndexedAccess` on array-first access**: `first[0].id` in tests needs `first[0]!.id`; typecheck catches it only if the test file is in the same `tsc --noEmit` run.
- **A shared default object is mutable**: `DEFAULT_EXECUTION_STRATEGY` is a module-level constant handed to every new ticket. Nothing mutates `plan.execution` today; if a later slice starts editing the pinned record, copy it first (or freeze it).
- **Scope discipline**: the mode switch, local-requirement storage and prompts all belong to C2–C4; adding any of them here would have made the PR unreviewable and overlapped the sibling branches.
