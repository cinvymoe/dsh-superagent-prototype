# C4 评审与测试证据 · 需求提问记录与 API（不进 Engine）

- Run: `run-mwdt6l0d-4`（execute，policy A1），issue `q-29218185:C4`
- Ticket: `62fa6ab64496c159c8aca2b897669319`
- 分支：`agent/api-engine-62fa6ab64496`；基线 deployment `main` @ `422a21a4`（已含 C3 的 `src/app/questions.ts`，PR #32 已合并）
- 实现 lane：`lane-T1-1`（subagent `cd94a456`，spawn / effort medium）完成后由 worker 复验、补测与修正文案
- 评审日期：2026-11-13

## 变更范围

7 个生产文件（其中 `src/app/local-questions.ts` 新增）+ 2 个测试文件 + 面板夹具 + 架构文档；无 schema 迁移（`questions` 是需求记录的可选字段）。

| 文件 | 变更 |
| --- | --- |
| `src/sources/local-format.ts` | 新增 `LocalQuestion`（id/ticket/text/status/askedAt/answeredAt?/answer?/error?）与 `LocalIssue.questions?`；旧记录无该字段仍可读 |
| `src/app/local-questions.ts`（新） | `LocalQuestions`：`ask`/`retry`/`resume`/`idle`/`stop`、后台回答队列、5 个错误码触发的校验；`TicketAnswers` 端口契约与 `QUESTION_LIMIT`/`QUESTION_CHARS` 上限 |
| `src/app/local.ts` | 只加 `putIssue()`：需求记录的唯一写回入口，供提问记录使用 |
| `src/app/runtime.ts` | 装配 `new Questions(...)` 作为 `TicketAnswers`；`initialize()` 在 `executor.resume()` 后 `resume()` 重排；`httpHost` 暴露 `localQuestions`；`shutdown()` 在关闭数据库前 `await localQuestions.stop()`；未落定回答打 warn |
| `src/app/http.ts` | `POST local/issues/:id/questions` 与 `POST local/issues/:id/questions/:questionId/retry`；返回 `local.view(issue)`；`HttpHost.localQuestions` |
| `src/app/api.ts` | 两条路由的类型契约（只导入类型，面板可打包） |
| `src/core/errors.ts` | `questionText`/`questionTicket`/`questionNoSession`/`questionNotFailed`/`questionLimit`（均为 `refused` → 400 + code） |
| `src/client/locales.ts` | 5 条中英双语 `userError.*`，`{max}` 占位符两侧一致 |
| `tests/local.spec.ts` | 6 个用例：立即 `asked`、后台 `answered`、非关联/无 plan 拒绝、未启动会话拒绝、端口失败 + `retry` + 非失败拒绝重试、端口抛错、上限 |
| `tests/local-align.spec.ts` | 4 个用例：HTTP `asked` 且后台从 fork 读回答案、工单/Trigger/Decision 不变量、seed 重启重排、HTTP 拒绝与 404 |
| `tests/fixtures/panel-server.ts` | 两条新路由的机械桩（类型化路由表要求；面板尚未调用，C5 使用） |
| `docs/007-architecture.md` | Modules 新增 `local-questions.ts`、更新 `local.ts`/`local-format.ts` 行、Tests 两行，并新增 `### Local requirements` 段落 |

## 双轴评审

### Standards 轴

结论：**通过（approve）**，无 must-fix。worker 复验时补了两处（未落定回答的 warn 日志、端口抛错用例）并修了三处文案/注释，语义未变。

- **模块边界**：记录与队列在新模块 `src/app/local-questions.ts`；`LocalIssues` 只增加一个 `putIssue()` 写回入口，不承载提问语义；C3 的 `Questions` 端口未改，`LocalQuestions` 只以结构化契约 `TicketAnswers` 消费它（`Questions.ask` 天然满足）。HTTP 层只做校验、未知需求/提问的 404 与 `view()` 包装。
- **单一写入者**：`questions[]` 只由 `LocalQuestions` 写；`record()` 在写回前重读需求记录并只替换命中的那一条，评论/对齐/执行模式等其它字段不受影响；`ask`/`retry` 的“读 → 改 → 写”在同一个同步块内完成，中间没有 `await`。
- **状态的诚实性**：每条记录只会从 `asked` 落到 `answered` 或 `failed`；端口返回失败落 `failed` + message，端口抛错也落 `failed`（有用例），空答案落 `failed` 并给固定说明；工单已被删除时落 `failed` 说明原因；**停止/中断不写 `failed`**，记录保持 `asked` 由下次启动重排；真正的意外异常写 warn 日志而不是静默吞掉。
- **不进 Engine**：模块只写 `KV.local.issue` 记录，`store.tickets` 只读；没有 Trigger/Eval/Ticket/Assignment 写入，也没有 Engine 命令。运行时用例在提问前后与回答落定后各断言一次工单 `inputs/assignments/ended/updatedAt` 不变、`recentTriggers` 数量不变、该线程 Decision 数量不变。
- **错误语义**：五个新码都是 `refused`（400 + `code` + `values`），未知需求/未知提问是 404；中英文案来自同一份 `USER_ERRORS`，`tests/locales.spec.ts` 的“每个拒绝码都有两种语言”通过。
- **生命周期与顺序**：`resume()` 在 `executor.resume()` 之后，让重启后的 worker 会话先恢复再提问；`stop()` 在 shutdown 的 `Promise.allSettled` 中、`store.close()` 之前完成；`lifetime.abort()` 之后不再写记录。
- **有界**：每条需求最多 20 条提问（`questionLimit` 带 `{max}`）、单条提问最多 4000 字符（zod 与常量同源），提问文本会进入 fork 会话的 prompt，长度受控。
- **风格与文档**：沿用仓库风格（2 空格、无分号、单引号），`LocalQuestions` 与导出类型有 JSDoc（`tests/class-docs.spec.ts` 通过）；`api.ts` 只导入类型；新模块登记进 Modules 表（`tests/docs.spec.ts` 通过）。
- **测试质量**：断言可观察行为（记录状态、answer/error 文本、错误 code、HTTP 状态、端口入参、fork/归档调用），不耦合实现细节；单元用例用替身端口证明“请求路径不等待端口”，运行时用例用真实 `Questions` 端口与 HTTP 证明组合行为，并以 `structuredClone` 快照对比工单不被改动。

### Spec 轴（逐条对照冻结验收标准）

1. **`tests/local.spec.ts`：立即 `asked`；非关联工单被拒绝并带 code；端口返回后 `answered` 且 answer 非空；端口失败 `failed` + error，`retry` 重新排队**：通过。
   - `records a question as asked at once…`：`ask` 返回的 `question.status === 'asked'`、端口尚未调用，`idle()` 后端口收到 `(ticket, text, { signal })`，记录变为 `answered` 且 answer 非空、`answeredAt` 存在、`error` 不存在。
   - `refuses a question about a Ticket that this requirement did not dispatch`：`plan.issueId` 属于别的需求、以及没有 `plan` 的工单都抛 `questionTicket`，端口未调用、需求记录 `toEqual` 原记录（`updatedAt` 未变）。
   - `records a failed question with its reason, retries it…`：端口 `{ok:false, reason:'timeout', message}` → `failed` + error 含原 message；`retry` 返回同 `id` 的 `asked` 记录、清空 answer/error/answeredAt、列表长度仍为 1；再次 `idle()` 后 `answered`；对已回答记录 `retry` 抛 `questionNotFailed`；未知需求/提问返回 `undefined`。
   - `records a port that throws as a failure…`：端口抛错 → `failed` 且 error 含抛出的 message，不会永远停在 `asked`。
   - `refuses a question once the requirement keeps the limit`：20 条后第 21 条抛 `questionLimit`，端口未调用、记录数不变。
2. **`tests/local-align.spec.ts`：工单 inputs/assignments/ended 不变、无新 Trigger、无新 Decision；重启后 `asked` 重新排队；从未启动会话时拒绝并带 code**：通过。
   - `answers from a Session forked off the worker…`：给 worker 会话补一个已完成回合后经 HTTP 提问（200 且 `asked`），后台把问题交给 `session-fork-1`（`deliveries` 断言 `mode:queue` 与问题原文），fork 产出回答后记录为 `answered` 且 answer 非空、无 error；`controller.fork` 收到 `worker-<ticketId>`，`archiveSession` 收到 fork。
   - `returns asked at once, answers in the background and never touches the Ticket or the Engine`：HTTP 返回 `asked` 并出现在需求的 `questions`；请求返回后与队列落定后各比较一次工单快照（`inputs/assignments/ended/updatedAt` 全等）、`recentTriggers` 数量、该需求线程 Decision 数量；此用例里 worker 没有完成回合，真实端口按 C3 语义返回 `no-completed-turn`，记录落 `failed` 且有 error —— 失败路径也不碰工单。
   - `re-queues the questions a restart left asked`：用 `startRuntime(seed)` 模拟上一次进程留下的 store（需求带 `asked` 记录 + 对应工单），启动后 `resume()` 把它重新排队；真实端口因该工单没有 worker 会话而落 `failed` 且有 error，证明记录不再是 `asked` 而是被重新处理过。
   - `refuses a Ticket that never started a session and one of another requirement`：只有 pending 派工的工单 → 400 `questionNoSession`；别的需求的工单 → 400 `questionTicket`；不存在的工单/需求 → 404；空文本 → 400；所有拒绝都没有写入任何 `questions`。
3. **新错误码中英双语齐全，定向测试与 typecheck 通过**：通过。五个新码各有 zh/en `userError.*`（`{max}` 双侧一致），`pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts` = 3 files / 55 tests 全绿，`pnpm typecheck` exit 0。

附加核对（T1 实现契约）：`ask` 校验顺序与返回形状、`retry` 复用同一记录 id、`resume` 去重、`idle` 覆盖等待期间新排队的回答、`stop` 置位后不再写记录、HTTP 两条路由返回 `local.view()`、`runtime.ts` 的装配/重排/停止顺序，均与契约一致（见变更范围内的文件清单与上方运行证据）。

## 过程说明（诚实记录）

- `lane-T1-1` 完成实现与自测（其自述见工单会话记录）。worker 复验逐文件审查后做了三处小改动：`TicketAnswers` 注释与 `requirement's` 拼写修正、面板夹具注释措辞；另补两处改进——队列未落定时经 host `warn` 打日志（避免静默丢回答），以及“端口抛错落 `failed`”的单元用例（原来只测端口返回失败，未覆盖抛错）。
- lane 自述并已复核的三处偏差：① 触碰 `tests/fixtures/panel-server.ts`（类型化 `Api` 路由表在 typecheck 中要求补齐新路由，只加机械桩，面板当前不调用）；② 端口抛错被捕获为 `failed`（冻结契约只定义了结果联合，未规定抛错；行为合理且已补用例）；③ 架构文档没有可直接追加的既有小节，新增了 `### Local requirements`。
- 有一处顺序差异：`ask()` 先解析“未知需求 → `undefined`（404）”，再做空文本校验（400）。这是有意的 HTTP 语义（未知资源优先 404），实现契约里的顺序描述未覆盖此组合。
- **限制（不影响本切片验收）**：真实部署实例上的 live fork 问答仍属 C3 记录的人工验证遗留；本切片的运行时用例用夹具模拟 fork 的完成回合与回答，覆盖“HTTP → 队列 → 真实 `Questions` 端口 → fork 投递 → 回写”的组合，真实 DSH `fork`/`archiveSession` 的行为由 C3 的 `tests/questions.spec.ts` 覆盖。另：对“worker 会话已不在”的工单提问会按 C3 语义落 `failed`（error 说明无会话），待该工单重新运行后可 `retry`，不会静默丢失。

## 验证记录

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts` | 3 files / 55 tests passed | `docs/issues/evidence/c4-questions-targeted.log` |
| `pnpm typecheck` | exit 0（`tsc --noEmit`） | `docs/issues/evidence/c4-questions-typecheck.log` |
| `pnpm vitest run tests/questions.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts tests/http.spec.ts tests/panel-discuss.spec.tsx` | 5 files / 58 tests passed | `docs/issues/evidence/c4-questions-related.log` |
| `pnpm test`（全量） | 65 files：63 passed / 2 failed；1352 tests：1349 passed / 3 failed，均为宿主环境既有失败 | `docs/issues/evidence/c4-questions-full.log` |
| 基线对照（deployment `main` @ `422a21a4`，独立 worktree） | 同样 3 个失败（2× `runtime.spec.ts` 断言 `GIT_CONFIG_GLOBAL` 未设置、1× `environment.spec.ts` 断言英文 git 报错） | `docs/issues/evidence/c4-questions-baseline-env.log` |
| 干净环境复跑两个失败文件（`env -u GIT_CONFIG_GLOBAL LC_ALL=C LANG=C`） | 2 files / 108 tests passed | `docs/issues/evidence/c4-questions-clean-env.log` |
| `pnpm build` | exit 0，`✔ Build complete` | `docs/issues/evidence/c4-questions-build.log` |
| `git diff --check` | 无输出 | 会话记录 |

## 架构影响

`arch_impact: local`：新增一个 app 模块与两条管理 API 路由，`Api` 契约只增不改（面板尚未消费），`LocalIssue` 只加可选字段（无迁移），Engine、Executor、Source 插件语义均未改动。架构文档（`docs/007-architecture.md`）已同步模块表、测试表与新段落。
