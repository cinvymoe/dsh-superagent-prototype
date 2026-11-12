# C3 regression case: a Ticket's question is answered in a read-only Session forked off its worker

- Ticket: `12b1b458e8d85b4518e463ebd3e94b74` (slice C3 of alignment `q-29218185`「需求列表讨论支持对齐历史记录；对已对齐工单提问并反馈到讨论列表」)
- Branch: `agent/fork-12b1b458e8d8`
- Base: `40191e32` (deployment `main`), merged with `934a1f07` (current `main`) before opening the PR
- PR: [#32](https://github.com/cinvymoe/dsh-superagent-prototype/pull/32) (open; a person reviews and merges)
- Scope: the host-side Q&A port only — **not** the requirement record/API (C4) and **not** the panel (C5). `Questions.ask(ticket, question, { timeoutMs?, signal? })` forks `worker-<ticketId>` at its latest completed turn, decorates the fork with the answer prompt and exactly `read`/`read_image`/`glob`/`grep`, delivers the question, reads the assistant text the fork produced after its inherited prefix, and archives the fork. Asking writes nothing: no Trigger, Eval, Ticket or Assignment, no resume/wake, no `store.tickets` write. Failures carry `no-session`, `no-completed-turn`, `fork-failed`, `timeout` or `empty-answer`.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` (also `docs/issues/task-contract-C3-qa.md`) |
| Requirement snapshot / frozen acceptance | `requirement.md` (also `docs/issues/12b1b458e8d85b4518e463ebd3e94b74.md`) |
| Two-axis review | `docs/issues/review-C3-qa.md` |
| PR record | `docs/issues/PR-12b1b458e8d85b4518e463ebd3e94b74.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Targeted verification log | `evidence/c3-qa-targeted.log` |
| Typecheck log | `evidence/c3-qa-typecheck.log` |
| Full-suite log (pre-merge base) | `evidence/c3-qa-full-suite.log` |
| Shared runtime/tools suites | `evidence/c3-qa-shared-suites.log` |
| Host-environment failures (known) | `evidence/c3-qa-plain-host.log` |
| Verification after merging current main | `evidence/c3-qa-merged-main.log` |

## How to re-run

```sh
pnpm vitest run tests/questions.spec.ts tests/model-surface.spec.ts tests/docs.spec.ts
pnpm typecheck
pnpm vitest run tests/runtime.spec.ts tests/tools.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm vitest run
pnpm build
git diff --check
```

Expected on `main` + this slice: targeted 3 files / 29 tests pass; typecheck clean; shared suites 2 files / 121
tests pass; full suite 65 files / 1327 tests pass; build completes. A plain `pnpm vitest run` in this host process
reports 3 failures in `tests/environment.spec.ts`/`tests/runtime.spec.ts` from its `GIT_CONFIG_GLOBAL`/`LANG`, also on
the untouched baseline.

## What to check when this feature is touched again

1. `tests/questions.spec.ts` still proves the answer comes from **after** the fork boundary: the fixture seeds an
   earlier worker `assistant/message` inside the inherited prefix and the port must not return it.
2. The fork's tool allow list stays exactly `['read','read_image','glob','grep']`, and the system-prompt section stays
   `complete: true` with the `Answer one question about this Ticket` instruction.
3. Every path that forked archives the fork (`workspaceRegistry.archiveSession(forked, { stopActivity: true })`), and
   an archive failure never changes the result.
4. Asking leaves the Ticket identical: whole record, `inputs`, `assignments`, `ended`, `updatedAt`, Assignment count and
   the Trigger/Decision counts.
5. C4/C5 must go through `Questions` — a fork decorated by anything else keeps the worker preset's full tool set.

## Visual evidence

None: the slice renders no UI and adds no HTTP/API or panel surface. Before/After captures belong to C5's panel entry
and answer timeline.
