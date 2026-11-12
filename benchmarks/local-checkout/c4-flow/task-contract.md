# Task contract · C4

Ticket: `34aa692db47be2161da69571204aa9eb` (slice C4 of alignment `q-3603edff`), flow `execute`, policy A1, lane `light`.

Goal: document the operator flow from a merged pull request to a running checkout, keep every documented command/output/exit code equal to the implementation, and pin the flow with documentation tests. Change only `docs/005-panel.md`, `docs/006-deployment.md`, `docs/007-architecture.md` and `tests/docs.spec.ts`.

Delivered:

1. New `### After a merge: make the running version match the checkout` in 006: merge → `prepare` or **Pull and build** → restart per deployment form → verify `"restartRequired": false`, plus one exit-code paragraph.
2. A second hourly-check prompt using `activate --only-when-behind --if-idle --respect-stop`, reporting only when it acted or failed.
3. Four troubleshooting rows: a page still showing **Takes effect after a restart**, the busy-Executor skip, the intentional-stop skip, and a panel serving another checkout.
4. 005's Deployment bullet and 007's Configuration reload paragraph.
5. `tests/docs.spec.ts`: `local checkout flow documentation`, 3 cases / 10 assertions.

Constraints held: no `src/`, `scripts/`, `prompts/`, locale, configuration or schema change; no forward link from 005 to 006 (numbered-document link rule); no invented flag, route or output.

Verification: `pnpm vitest run tests/docs.spec.ts`, `pnpm typecheck`, full `pnpm check`, `git diff --check`.
