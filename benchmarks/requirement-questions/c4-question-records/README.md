# C4 regression case: requirement questions recorded and answered in the background

- Ticket: `62fa6ab64496c159c8aca2b897669319` (slice C4 of alignment `q-29218185`「需求列表讨论支持对齐历史记录；对已对齐工单提问并反馈到讨论列表」)
- Branch: `agent/api-engine-62fa6ab64496`
- Base: `422a21a4` (deployment `main`, which already contains C3's `src/app/questions.ts`)
- PR: [#37](https://github.com/cinvymoe/dsh-superagent-prototype/pull/37)
- Scope: the requirement-side question records, HTTP API and background queue — **not** the fork port (C3) and **not** the panel (C5).
  `POST local/issues/:id/questions` records `asked` on the requirement and returns; the queue calls the C3 `Questions` port and
  writes `answered` (with the answer) or `failed` (with the reason) back on the same requirement record; `retry` re-queues a
  failed question under the same record; a start re-queues every question a previous run left `asked`; stopping writes nothing.
  Asking only applies to the requirement's own dispatched Ticket with a started worker Session, and never reaches the Engine:
  no Trigger, Eval, Ticket or Assignment is written, and the Ticket is only read.

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` (also `docs/issues/62fa6ab64496c159c8aca2b897669319.md`) |
| Two-axis review | `docs/issues/review-C4-questions.md` |
| PR record | `docs/issues/PR-62fa6ab64496c159c8aca2b897669319.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Implementation contract | `task-contract.md` |
| Targeted verification log | `evidence/c4-questions-targeted.log` |
| Typecheck log | `evidence/c4-questions-typecheck.log` |
| Related suites log | `evidence/c4-questions-related.log` |
| Full-suite log (this host) | `evidence/c4-questions-full.log` |
| Same failures on untouched `main` @ `422a21a4` | `evidence/c4-questions-baseline-env.log` |
| Two failing files re-run with a clean environment | `evidence/c4-questions-clean-env.log` |
| Build log | `evidence/c4-questions-build.log` |

## How to re-run

```sh
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts
pnpm typecheck
pnpm vitest run tests/questions.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts tests/http.spec.ts tests/panel-discuss.spec.tsx
pnpm test            # expect the 3 known host-env failures below
env -u GIT_CONFIG_GLOBAL LC_ALL=C LANG=C pnpm vitest run tests/environment.spec.ts tests/runtime.spec.ts
pnpm build
git diff --check
```

Expected on `main` + this slice: targeted 3 files / 55 tests pass; typecheck clean; related 5 files / 58 tests pass; full suite
1352 tests with 1349 passing; the 3 failures are this host's `GIT_CONFIG_GLOBAL` and `zh_CN` `git` output and also fail on the
untouched baseline; those two files pass 108/108 in a clean environment; build completes.

## What to check when this feature is touched again

1. `ask` returns the record already `asked` and the port is not called yet: the HTTP path must never wait for a fork answer.
2. A non-associated Ticket (`plan.issueId` of another requirement, or no plan) is refused with `questionTicket`; an
   associated Ticket whose assignments all lack `startedAt` is refused with `questionNoSession`.
3. A port result is recorded as `answered` only with a non-empty answer; every other outcome (port failure, thrown port,
   empty answer, vanished Ticket) becomes `failed` + non-empty `error`; `retry` only accepts `failed` (`questionNotFailed`).
4. Stopping/aborting must not write `failed`: the record stays `asked` so the next start's `resume()` re-queues it. The
   seeded store test in `tests/local-align.spec.ts` proves the re-queue happens at startup.
5. Asking leaves the Ticket identical: `inputs`, `assignments`, `ended`, `updatedAt` and the thread's Trigger/Decision counts.
6. `questions[]` stays single-writer: `LocalQuestions.record()` re-reads the requirement and rewrites only its own record, so
   concurrent comments/alignment edits survive.
7. C5 must consume the typed routes in `src/app/api.ts` and the `questions` field on the requirement view; it must not fork a
   Session itself.
