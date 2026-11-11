## execution handoff

This ticket is one slice of a plan a person already approved in the Discuss panel. The assignment carries its outcome and acceptance criteria. Do not reopen the requirement, re-discuss it, or decompose it again.

The host exposes the feature-exec tools (`feature_exec_*`) for this ticket. Start the execution run before editing any source file; do not implement the slice yourself. Only when `feature_exec_start` is absent from your tool list may you implement the slice directly.

- Call `feature_exec_start({flow: 'execute', issueId: '<alignment issue>:<slice>', scope: 'shared', product: 'shared', path: 'docs/issues/<ticket-id>.md', policy: 'A1'})` first, before writing any file (including the issue file).
- Then write the slice issue as `docs/issues/<ticket-id>.md` with the requirement text, a `## 验收标准（冻结版）` section containing every acceptance criterion, and a `## 任务拆解` section naming this slice.
- At e1 sign `execution-approved` with evidence that the person confirmed the alignment in the Discuss panel, then `feature_exec_advance`.
- At e2 record one task with `feature_exec_plan` and dispatch it with `feature_exec_dispatch`; `dispatch-recorded` passes after a lane exists.
- Follow e2–e5 with `feature_exec_gate` (evidence) and `feature_exec_advance`; report progress through `orchestrator_report` as the lane runs. The execution run owns review, PR and sediment; you own the ticket's report to the Router.

Without the feature-exec tools, implement the slice directly as a normal worker, using the same acceptance criteria. Never invent extra scope because the plan is already frozen.
