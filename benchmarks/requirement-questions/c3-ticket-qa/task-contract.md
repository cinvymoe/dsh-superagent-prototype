# Task contract · C3 · Ticket Q&A Session (fork, read-only, one-shot)

Ticket: `12b1b458e8d85b4518e463ebd3e94b74` (slice `C3` of alignment `q-29218185`)
Worktree (dispatch cwd): `/data/project/workspace/dsh-worktrees/fork-12b1b458e8d8`
Issue file: `docs/issues/12b1b458e8d85b4518e463ebd3e94b74.md`
Stack: deployment `main` @ `40191e32` on branch `agent/fork-12b1b458e8d8`. `node_modules` in this worktree is a symlink
to a sibling worktree with the identical `pnpm-lock.yaml` (md5 `2e02280f…`); it is gitignored. Do not commit it.
`pnpm vitest run tests/docs.spec.ts tests/model-surface.spec.ts` and `pnpm typecheck` are green on this baseline.

## Goal

Deliver the host-side, unit-testable **one-shot Q&A port for a Ticket**: fork the Ticket's worker Session
(`worker-<ticketId>`) at its latest completed turn, ask one question in the forked Session, get the answer text, then
archive that Session. The forked Session gets a dedicated answer system prompt and exactly the read-only tools
`read`, `read_image`, `glob`, `grep`. Failure paths (no session, no completed turn, fork failure, timeout) return a
reason. Asking must not change the Ticket in any way: no Trigger/Eval/Ticket/Assignment, no `store.tickets` write,
no Engine call. Wiring into the local requirement record and the HTTP API is C4 — do not do it here.

## Frozen acceptance criteria (verbatim from the alignment)

1. `tests/questions.spec.ts`: 对已有完成回合的工单返回回答文本；无会话、无完成回合、超时三条路径返回带原因的失败；问答前后
   `store.tickets` 中该工单不变（inputs/assignments/ended 不变）。
2. 问答会话注册的工具白名单恰为 `read`/`read_image`/`glob`/`grep`，系统提示含问答指令；回答结束后该会话被归档。
3. `docs/007-architecture.md` 模块表与测试表包含新文件，`pnpm vitest run tests/questions.spec.ts tests/model-surface.spec.ts
   tests/docs.spec.ts` 与 `pnpm typecheck` 通过。

## Files (change only these)

- `src/app/questions.ts` — NEW: the `Questions` port.
- `src/app/sessions.ts` — decorate a forked Q&A Session (answer prompt section + read-only tool whitelist + executor model).
- `src/app/prompts.ts` — `composeAnswer()`.
- `src/app/context.ts` — `answerPrompt = promptFile('answer')`.
- `prompts/answer.md` — NEW: the Q&A system prompt.
- `tests/questions.spec.ts` — NEW: the acceptance tests.
- `tests/fixtures/host.ts` — `fork`, `archiveSession`, per-Session prompt sections, `tools.restrict` allow lists,
  per-Session event history for `inspect`/`snapshotEvents`, `glob`/`grep` among the fake built-ins.
- `docs/007-architecture.md` — module table, test table, and one short prose paragraph (see below).

Do not touch `src/app/runtime.ts`, `src/app/local.ts`, `src/app/http.ts`, `src/app/api.ts`, `src/sources/*`,
`src/client/*`, `tests/local*.spec.ts`, `docs/005-panel.md`, or any other slice's docs. Do not commit or push; the
worker reviews, commits and opens the PR.

## Design (agreed seams — keep them)

### `src/app/questions.ts`

```ts
/** One answer about a Ticket, or why the question could not be answered. */
export type QuestionResult = { ok: true; answer: string } | { ok: false; reason: QuestionFailureReason; message: string }
export type QuestionFailureReason = 'no-session' | 'no-completed-turn' | 'fork-failed' | 'timeout' | 'empty-answer'

export interface QuestionsHost {
  readonly context: Context
  readonly store: Pick<Store, 'tickets'>   // read-only; never written
  readonly sessions: Pick<Sessions, 'answer' | 'prompt'>
  /** Host lifetime; a stop aborts a waiting question. */
  readonly lifetime?: AbortSignal
  /** Default wait for one answer. */
  readonly timeoutMs?: number
}

export class Questions {
  constructor(host: QuestionsHost)
  async ask(ticket: Ticket, question: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<QuestionResult>
}
```

`ask` steps:

1. `worker = workerSessionId(ticket.id)` (import from `src/executor/dsh.ts`; it is exported).
2. Resolve the worker Session with `context.sessionController.resolveAgent(worker)`. A `session/not-found` result (or a
   `session/not-found` error thrown by `inspect`) → `{ ok: false, reason: 'no-session', message }`. Never create it.
3. Read its events with `context.sessionController.inspect(worker)` (positional `SessionId`, same as
   `src/app/resources.ts`). No `turn/end` event anywhere in the events → `{ ok: false, reason: 'no-completed-turn' }`
   (fork would select the latest completed-turn prefix; a running turn after an earlier completed one is fine).
4. `context.sessionController.fork({ sessionId: worker })`; a throw → `{ ok: false, reason: 'fork-failed', message }`.
   Keep the returned `sessionId` as `forked`.
5. `const agent = await sessions.answer(forked, ticket)`; deliver the question with
   `sessions.prompt(forked, `question:${forked}`, question, 'queue')` (the forked id is unique, so the request id is
   too).
6. Wait for the answer turn to end: `agent.whenIdle()` raced against `timeoutMs` (default `120_000`) and
   `options.signal`/`lifetime`. On timeout/abort: cancel the agent's turn (`agent.cancel({ kind: 'user' })`, ignore a
   throw), archive the forked Session, return `{ ok: false, reason: 'timeout', message }`.
7. Read the answer from the forked Session's own events after the fork boundary: `inspect(forked).events`, keep
   `assistant/message` events with `seq >= agent.session.header.inheritedEventCount`, take the last, join its `text`
   blocks and trim. An empty result → `{ ok: false, reason: 'empty-answer' }`.
8. Archive the forked Session in every path where it exists, success or failure:
   `context.workspaceRegistry.archiveSession(forked, { stopActivity: true })`. Archive failures must not turn a
   successful answer into a failure (log via `context.logger.warn`), and must not mask the original failure.
9. Return `{ ok: true, answer }`.

`ask` must not read `store.tickets` at all (it takes the `Ticket` argument); `QuestionsHost.store` may be dropped if
unused. No `Engine` import, no `reports`/`inputs`/`assignments` writes.

### `src/app/sessions.ts`

Add `answer(sessionId: SessionId, ticket: Ticket): Promise<Agent>` used only by the Q&A port:

- `resolveAgent(sessionId)`; throw its error when the Session is gone.
- `initializeRoleModel(this.ctx, agent, store.settings().executor.model)`.
- Register a `systemPrompt.section` with `complete: true` (the Q&A Session gets the answer prompt instead of the
  worker preset's prompt), text = `[dsh-superagent prompt revision ${version.revision}]\n${this.host.prompts.composeAnswer()}`,
  and track its disposer in a `SessionBinding`.
- Restrict tools to exactly `["read", "read_image", "glob", "grep"]` via
  `agent.ctx.tools.restrict({ allow })`, after checking each is provided (`agent.ctx.tools.get(name, scopeParentOf(agent))`);
  a missing one throws an `Error` naming it (as `mainTools` does) instead of silently shrinking the whitelist.
- `ctx.permissionPresets.set(agent.session, 'danger-full-access')` so the read tools can read the Ticket directory
  (the whitelist, not the permission, is the read-only boundary), and `ctx.sessionController.rename({ sessionId,
  title: `Ticket question · ${ticket.title}` })`.
- Return the agent. The binding is released by the existing `agent/disposed` handler.

`SessionsHost.prompts` gains `'composeAnswer'` in its `Pick`.

### `prompts/answer.md` (`promptFile` joins lines within a paragraph) and `Prompts.composeAnswer`

The text must state, in the repo's imperative prose (one sentence per line, no bullet lists required):

- This is a one-shot question about one Ticket, forked from the Ticket worker's conversation; answer that question.
- Use only the read-only tools `read`, `read_image`, `glob`, `grep`; never write, edit, run a shell, start a
  feature-exec run, or send messages.
- Answer from the conversation, the files and the git history you can read; name the files you used.
- Do not change or report on the Ticket, do not ask a person anything, and do not offer follow-up work.
- If the context cannot answer the question, say what is missing instead of guessing.
- Answer in the language of the question; be concise.

`Prompts.composeAnswer(): string` returns `${sharedPrompt}\n\n${answerPrompt}` (import `answerPrompt` from
`./context.ts`; `sharedPrompt` is already imported there) and must contain the phrase
`Answer one question about this Ticket` so the test can assert the section is the answer prompt.

### `tests/fixtures/host.ts`

Extend the fake host so the C3 tests can assert the contract (keep every existing spec green):

- Fake built-ins add `glob` and `grep` to the `builtins` array.
- Capture the system prompt section per Session: `systemPrompt.section(spec)` stores `spec` in a `sections` Map keyed
  by session id (`{ text: (context) => string, complete?: boolean }`) and returns a disposer.
- Record each `tools.restrict({ allow })` call per Session (a `restrictions` Map of session id → `string[][]`, newest
  last) and keep the disposer behavior.
- Keep a per-Session event history (`events` Map, exposed on the returned host) used by
  `session.snapshotEvents()` and by `sessionController.inspect(sessionId) => ({ events })`, so a spec can seed the
  worker's completed turns and the forked Session's `assistant/message`; give the fake Session `header:
  { inheritedEventCount }` (set by `fork` to the source's event count).
- Add `controller.fork: vi.fn(async ({ sessionId }) => …)`: create a new fake Session (`create`) with a deterministic id
  (`session-fork-<n>`), copy a `cwd` like the real fork, set its `inheritedEventCount` to the source's event count +
  the copied prefix, and return `{ sessionId }`. A spec must be able to make it throw (`mockRejectedValueOnce`) for the
  `fork-failed` test.
- Add `workspaceRegistry.archiveSession: vi.fn(async () => {})` and expose the mock (e.g. `archiveSession`) so the
  spec asserts both the happy path and the timeout path archived the forked id.
- Keep `deliveries`, `relays`, `acceptedTicket`, `stop` and every other return value working.

### `tests/questions.spec.ts`

Use `startRuntime` from `tests/fixtures/host.ts` and construct `new Questions({ context: host.ctx, store:
host.runtime.store, sessions: host.runtime.sessions })`. Cover, at minimum:

1. **Answer**: a Ticket with a worker Session seeded with `turn/start` + `turn/end`; `fork` resolves; the forked
   Session's prompt arrives (assert through `host.deliveries`); the spec appends an `assistant/message` with the answer
   text to the forked Session's events and ends its turn (status idle). `ask` resolves `{ ok: true, answer }` with the
   exact text.
2. **No session**: a Ticket in the store whose `worker-<id>` Session does not exist → `reason: 'no-session'`, and no
   fork call.
3. **No completed turn**: the worker Session exists with events but no `turn/end` → `reason: 'no-completed-turn'`, and
   no fork call.
4. **Timeout**: worker has a completed turn and the fork resolves, but the answer Session never goes idle; pass a tiny
   `timeoutMs` → `reason: 'timeout'`, the forked Session was archived, and the turn was cancelled.
5. **Whitelist + prompt**: for the happy path, `host.restrictions.get(forkedId).at(-1)` equals exactly
   `['read', 'read_image', 'glob', 'grep']`, and the captured section's `text({})` contains
   `Answer one question about this Ticket` and is `complete: true`.
6. **Archived**: `host.archiveSession`/`workspaceRegistry.archiveSession` was called with `forkedId` after the answer.
7. **Ticket unchanged**: snapshot `runtime.store.tickets.get(id)` before and after (deep equal; at least `inputs`,
   `assignments`, `ended`, `updatedAt`), and assert no new Trigger/Decision rows and the same Assignment count.

Keep the test deterministic: no real timers longer than a few milliseconds, no network.

### `docs/007-architecture.md`

- Module table (`## Modules`): one row for `src/app/questions.ts`.
- Tests table (`## Tests`): one row for `tests/questions.spec.ts`.
- Prose: extend `### Sessions` (or a short paragraph beside it) with one or two sentences saying that a Ticket's
  question is answered by a Session forked from its worker Session at the latest completed turn, decorated with the
  answer prompt and only the read-only tools, archived after the answer, and that asking leaves the Ticket unchanged.

`tests/docs.spec.ts` requires the tables to list **every** `src/**` file and **every** `tests/**/*.spec.ts` file and
only existing files; add rows in the existing `| `path` | description |` format.

## Acceptance plumbing

- `pnpm vitest run tests/questions.spec.ts tests/model-surface.spec.ts tests/docs.spec.ts` → green.
- `pnpm typecheck` → green.
- Also run `pnpm vitest run tests/runtime.spec.ts tests/tools.spec.ts` because `sessions.ts` and the host fixture are
  shared; the existing 1288-test suite must stay green (note: this host process sets `GIT_CONFIG_GLOBAL`/`LANG`, so
  `tests/environment.spec.ts`/`tests/runtime.spec.ts` may report the 3 known host-environment failures; compare with
  the untouched baseline instead of "fixing" them). Run the full suite as `env -u GIT_CONFIG_GLOBAL -u
  GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm vitest run` for the
  clean result.
- Record the commands and their tail output in `docs/issues/evidence/c3-qa-*.log`.

## Report

Reply with: files changed, the exact acceptance mapping (criterion → test name), commands run with pass/fail and
counts, any deviation from this contract with its reason, and anything you could not verify. Do not commit, push, or
open a pull request.
