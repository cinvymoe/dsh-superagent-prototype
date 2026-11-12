# Attempt log · P1

| Time (Asia/Shanghai) | Event |
| --- | --- |
| 2026-11-12 12:58 | Execute run `run-mwd2vazl-5` started; slice issue written under `docs/issues/72eef87fa22817c7628e4a74ecffb1a0.md`; base merged deployment `main` @ `3b8c6a8`. |
| 13:09 | Lane `lane-T1-project-tabs-1` dispatched (subagent, T2, high) with `docs/issues/task-contract-P1-project-tabs.md`. |
| 13:09–13:27 | Lane implemented `projects.tsx`, route/provider/app/discuss/locales/css, fixture, both panel specs and docs 005/007; typecheck, targeted tests, full tests, build and `git diff --check` passed; lane reported completion without commits. |
| 13:27–13:35 | Worker review: added page-tab round trip, switched-project submission target, project-list/inline-form absence, worktreeRoot visibility, create-page Back and no-POST assertions; changed create/cancel/project-switch navigation to replace; fixed `route.create` union narrowing; removed unused `discuss.projectRequired`. Re-ran targeted tests and typecheck. |
| 13:36–13:39 | Rebuilt `lib`, started isolated `p1-before` (3095) and `p1-after` (3096) profiles, seeded synthetic states, captured real-panel before/after pairs at 1440×1100 and 900×1100 (light, zh-CN), plus More menu and hidden-project selection. |
| 13:41 | `env -u … LC_ALL=C pnpm check` passed (63 files / 1248 tests, build complete); `git diff --check` clean; logs saved under `docs/issues/evidence/`. |
| 13:45 | Final targeted suite 6 files / 38 tests passed; slice review and benchmark case written. |

## Lane notes

- One implementation lane, no retry. The worker owned the extra assertions, navigation polish, screenshots and delivery after the lane's completion report.
