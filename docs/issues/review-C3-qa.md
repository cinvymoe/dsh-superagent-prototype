# C3 双轴评审与测试证据 · 工单问答会话（fork，只读、一次性）

- Run: `run-mwdqubvj-10`（execute，policy A1），issue `q-29218185:C3`
- Ticket: `12b1b458e8d85b4518e463ebd3e94b74`
- 分支：`agent/fork-12b1b458e8d8`，基线 deployment `main` @ `40191e32`
- 实现 lane：`lane-T1-2`（`lane-T1-1` 因模型路由失败未产生任何改动，重派后完成）
- 评审日期：2026-11-13

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/app/questions.ts`（新增） | `Questions` 问答端口：`ask(ticket, question, { timeoutMs?, signal? })`；`resolveAgent`→`no-session`、`inspect` 无 `turn/end`→`no-completed-turn`、`fork` 抛错→`fork-failed`、`whenIdle` 限时→`timeout`（cancel + 归档）、空回答→`empty-answer`；成功返回 `{ ok: true, answer }`，每条创建了 fork 的路径都在 `finally` 归档 |
| `src/app/sessions.ts` | `SessionsHost.prompts` 增加 `composeAnswer`；`ANSWER_TOOLS = ['read','read_image','glob','grep']`；新增 `Sessions.answer(sessionId, ticket)`：执行角色模型、`complete: true` 的 answer 系统提示、只读工具白名单（缺一即抛错）、`danger-full-access`、重命名、disposer 随 `agent/disposed` 释放 |
| `src/app/prompts.ts` | `composeAnswer()` = `sharedPrompt` + `answerPrompt` |
| `src/app/context.ts` | `answerPrompt = promptFile('answer')` |
| `prompts/answer.md`（新增） | 一次性只读问答指令，含 `Answer one question about this Ticket` |
| `tests/questions.spec.ts`（新增） | 6 个用例：回答、无会话、无完成回合、超时、fork 失败、空回答；白名单/提示/归档/工单不变断言 |
| `tests/fixtures/host.ts` | `glob`/`grep` 内建；按会话的事件日志供 `inspect`/`snapshotEvents` 与 `header.inheritedEventCount`；捕获 `systemPrompt.section` 与 `tools.restrict` 白名单；`fork`（复制最近完成回合前缀）；`workspaceRegistry.archiveSession` |
| `docs/007-architecture.md` | 模块表 `src/app/questions.ts` 行、测试表 `tests/questions.spec.ts` 行、Sessions 段一句问答语义 |

## Standards 轴

结论：**通过（approve）**。

- **模块边界**：fork/超时/失败原因等端口语义集中在 `src/app/questions.ts`；会话装饰（提示、工具、模型、权限、重命名）留在 `src/app/sessions.ts`，与主 Session / worker Session 的装饰并列；提示文本在 `prompts/answer.md` 经 `context.ts`/`prompts.ts` 读取。问答端口不导入 Engine、不写 Store，也不产生 Trigger/Eval/Ticket/Assignment。
- **只读边界**：白名单是唯一边界（恰为 `read`/`read_image`/`glob`/`grep`，缺任一即抛错而不是静默缩小），权限沿用 worker 的 `danger-full-access` 只是为了让读取工具能读工单目录；`Sessions.answer` 的 JSDoc 明说这一点。
- **单一写入者/副作用**：`answer` 与 `ask` 只读写会话侧（fork、prompt、inspect、cancel、archive）；`workspaceRegistry.archiveSession` 是唯一的会话生命周期写入，且每条 fork 路径都归档；归档失败只记 warn，不掩盖回答或失败原因。
- **幂等与标识**：请求 id 用唯一的 fork 会话 id（`question:<forked>`），一个 fork 只答一问；回答取 fork 边界（`agent.session.inheritedEventCount`，DSH 的 `Session` 公开属性）之后的最后一条 `assistant/message`，继承前缀里 worker 的旧 assistant 消息不会被误当答案。
- **错误语义**：可预期的问答失败都返回 `{ ok: false, reason, message }`（`no-session`/`no-completed-turn`/`fork-failed`/`timeout`/`empty-answer`），由 C4 记录 `failed` 并可重试；只有 Session 域的非 `session/not-found` 存储/宿主故障才抛出，JSDoc 已写明。
- **文档**：`docs/007-architecture.md` 模块表与测试表各一行（docs.spec 校验全量 `src`/`tests` 文件与存在性），Sessions 段补问答语义；未改 `docs/005`（面板属 C5）。
- **差异卫生**：`git diff --check` 无输出；无无关重构、无新依赖；`node_modules` 符号链接未入库（gitignore）。
- **已知取舍（不阻塞）**：`QuestionsHost.store` 当前未被端口读取，保留它是为 C4 的宿主形状稳定（契约允许）；`untilIdle` 把 `whenIdle()` 的 reject 视作回合结束，真实 DSH 中 `whenIdle` 以 resolve 结束回合，异常回合会落到 `empty-answer`。两点均记录给 C4 复核。

## Spec 轴（逐条对照冻结验收标准）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `tests/questions.spec.ts`：对已有完成回合的工单返回回答文本；无会话、无完成回合、超时三条路径返回带原因的失败；问答前后 `store.tickets` 中该工单不变（inputs/assignments/ended 不变） | PASS | `answers one question from a Session forked off the worker's latest completed turn, then archives it`（继承前缀里放 worker 的旧 assistant 消息，断言只取 fork 之后的答案，并 `toEqual` 整个 Ticket 与 inputs/assignments/ended/updatedAt、Assignment 数、Trigger/Decision 数）；`refuses a Ticket whose worker Session does not exist, without forking`；`refuses a worker Session without a completed turn, without forking`；`times out a question whose turn never ends, cancels it and archives the forked Session` |
| 2 | 问答会话注册的工具白名单恰为 `read`/`read_image`/`glob`/`grep`，系统提示含问答指令；回答结束后该会话被归档 | PASS | 同一 happy-path 断言 `restrictions.get(FORKED).at(-1)` 精确等于 `['read','read_image','glob','grep']`、`sections.get(FORKED).complete === true`、`section.text({})` 含 `Answer one question about this Ticket`、`archiveSession(FORKED, { stopActivity: true })`；`empty-answer` 与 `timeout` 用例也断言归档 |
| 3 | `docs/007-architecture.md` 模块表与测试表包含新文件，`pnpm vitest run tests/questions.spec.ts tests/model-surface.spec.ts tests/docs.spec.ts` 与 `pnpm typecheck` 通过 | PASS | 007 两行已加；定向 3 files / 27 tests passed；`tsc --noEmit` exit 0；全量干净环境 64 files / 1301 tests passed；`pnpm build` 通过（见下） |

补充（端口契约、非冻结清单）：`reports a failed fork with its message, and archives nothing` 与 `reports an empty answer and archives the forked Session` 覆盖声明中的另两条原因。

## 测试证据

- 定向：`pnpm vitest run tests/questions.spec.ts tests/model-surface.spec.ts tests/docs.spec.ts` → 3 files / 27 tests passed（`docs/issues/evidence/c3-qa-targeted.log`、worker 复跑 `c3-qa-worker-recheck.log`）。
- 类型：`pnpm typecheck` → exit 0（`c3-qa-typecheck.log`、`c3-qa-worker-recheck.log`）。
- 全量（干净环境）：`env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm vitest run` → 64 files / 1301 tests passed（`c3-qa-full-suite.log`、`c3-qa-worker-recheck.log`）。
- 共享套件：`tests/runtime.spec.ts tests/tools.spec.ts` → 2 files / 121 tests passed（`c3-qa-shared-suites.log`）。
- 构建：`pnpm build` → Build complete（`c3-qa-worker-recheck.log`）。
- 宿主环境（`GIT_CONFIG_GLOBAL`/`LANG`）下仅 3 个既有环境相关失败，与未改动基线一致（`c3-qa-plain-host.log`），不属于本 slice。

## 验证缺口（如实记录）

- 真实 DSH 宿主上的 live fork / cancel / archive 与真实模型回答质量未在 CI 覆盖：夹具的内存 `sessionController` 只验证端口契约。计划的总体验收第 5 条已要求在部署实例上线后人工验证一次真实 fork 问答，本 slice 不假装覆盖。
- C4 才把 `Questions` 接到需求记录与 HTTP；C5 才做面板入口与时间线。

## 架构影响

`Architecture impact: local` —— 新增一个 host 侧模块 `src/app/questions.ts` 与 `Sessions.answer`/`Prompts.composeAnswer`，新增一个提示文件；不改公共 HTTP API、数据库 schema、Engine 语义或既有 Source 行为。
