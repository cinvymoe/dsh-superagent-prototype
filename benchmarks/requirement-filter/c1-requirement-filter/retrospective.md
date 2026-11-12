# Retrospective

- The frozen contract was detailed enough for one lane to finish the implementation without a retry; the worker still had to add the English label assertions, merge the then-current main, and own the screenshots and delivery.
- Two baseline-vs-head issues were caught only by capturing: the vanilla baseline has no filter row, so the "non-default filter" pair can only show the baseline's full list. The PR states that limitation explicitly instead of faking a baseline filter.
- The first capture read the DOM too early and logged a transient 0-count while the rows were already painted; waiting for the rendered list before reading fixed the logs, and the final screenshots were taken after the wait.
- The host environment's `GIT_*` variables and localized git errors reproduce the known failures in `environment.spec.ts` / `runtime.spec.ts`; the `env -u ... LC_ALL=C` recipe from the earlier worktree-root case is still the reliable gate.
