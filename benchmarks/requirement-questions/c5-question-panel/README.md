# C5 regression case: ask about a linked Ticket and read the answer in the timeline

- Ticket: `96d585fa7995596f6c339a86778335e4` (slice C5 of alignment `q-29218185`「需求列表讨论支持对齐历史记录；对已对齐工单提问并反馈到讨论列表」)
- Branch: `agent/slice-96d585fa7995`
- Base: `3a1626cc` (deployment `main` `422a21a4` merged with C4 `2eaa51cc`)
- PR: [#39](https://github.com/cinvymoe/dsh-superagent-prototype/pull/39)
- Scope: the **panel** only — the Ask entry on a requirement's linked Ticket rows, the question/answer events in its message timeline, the failure retry, and the doc rows this requirement touches. The records, queue and HTTP routes are C4 (PR #37, stacked below this branch); the fork port is C3 (merged).

## What the case locks down

- A linked Ticket offers **Ask** only where it also offers **Open Session** (`ticket.sessionId` non-empty), and both live in the same row action cell; submitting posts `POST local/issues/:id/questions` with `{ ticket, text }`, re-reads the requirement and closes the composer.
- The message timeline carries one event per question, sorted newest first among the thread's messages and replies, labelled with its Ticket and showing: the waiting copy (`asked`), the Markdown answer in its own block (`answered`), or the stored reason plus **Retry question** (`failed`).
- Retrying posts `POST local/issues/:id/questions/:questionId/retry` and the record returns to waiting.
- The requirement description, the question and the answer each render exactly once; questions never enter the thread's Trigger timeline.

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` (also `docs/issues/96d585fa7995596f6c339a86778335e4.md`) |
| Two-axis review | `docs/issues/review-C5-questions.md` |
| PR record | `docs/issues/PR-96d585fa7995596f6c339a86778335e4.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Implementation contract | `task-contract.md` |
| Targeted suites log | `evidence/c5-targeted.log` |
| Related suites log | `evidence/c5-related.log` |
| Typecheck / build logs | `evidence/c5-typecheck.log`, `evidence/c5-build.log` |
| Full `pnpm check` log (clean environment) | `evidence/c5-check.log` |
| Screenshot capture logs and seed script | `evidence/c5-capture-before.log`, `evidence/c5-capture-after.log`, `evidence/c5-questions-seed.mjs` |
| Same-viewport screenshots | `docs/issues/evidence/c5/` (`before-tickets.png`, `after-tickets.png`, `before-timeline.png`, `after-timeline.png`, `after-composer.png`) |

## How to re-run

```sh
pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/questions.spec.ts tests/class-docs.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected on this branch: targeted 3 files / 58 tests pass; related 4 files / 56 tests pass; typecheck clean; `pnpm check` 65 files / 1357 tests with the build completing and exit 0.

To re-take the screenshots:

```sh
node docs/issues/evidence/c5/c5-questions-seed.mjs /root/.dsh/state/c5-before   # and c5-after, or any two state dirs
dsh --profile c5-before --no-open   # host 10.126.126.6:3191, profile links dsh-superagent at the Before tree
dsh --profile c5-after --no-open    # host 10.126.126.6:3192, profile links this worktree after `pnpm build`
python3 /tmp/c5-capture.py '<printed token URL>' docs/issues/evidence/c5 before   # and after
```

The two profiles differ only in the linked `dsh-superagent` tree, the port and the state directory; both use 1440×900, light theme and zh-CN.

## What to check when this feature is touched again

- The row condition stays identical to Open Session: an unstarted Ticket must offer neither entry, and the host still refuses `questionNoSession`.
- The composer stays single-instance per row (opening one hides that row's own Ask entry) and one composer at a time across rows.
- Questions still render outside `data.thread.timeline`; if someone joins them into the Trigger list, the description/question/answer once-each assertions will fail.
- Markdown answers keep rendering through `MarkdownLite` (the test asserts a `<strong>` and a `<li>`, not just the text).
- `ticket` stays the request body field (C4's contract); renaming it breaks the real host even though a fixture could hide it.
