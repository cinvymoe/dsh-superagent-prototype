# C5 评审与测试证据 · 面板提问入口、回答时间线与文档收口

- Run: `run-mwduxpwq-5`（execute，policy A1），issue `q-29218185:C5`
- Ticket: `96d585fa7995596f6c339a86778335e4`
- 分支：`agent/slice-96d585fa7995`；基线 deployment `main` @ `422a21a4` + C4 分支 `agent/api-engine-62fa6ab64496`（`3a1626cc`）
- 实现 lane：`lane-T1-1`（subagent `6894f9a6`，spawn / effort high）完成后由 worker 复验、两处 UI 收敛（删掉重复的等待文案、打开提问框时隐藏该行入口）与文档/证据补齐
- 评审日期：2026-11-13

## 变更范围

2 个生产文件 + 1 个测试文件 + 2 份文档；无新模块、无 CSS、无宿主改动。

| 文件 | 变更 |
| --- | --- |
| `src/client/discuss.tsx` | 关联工单行：与 `SessionButton` 同一 `dt-row-actions` 内新增 **Ask** 入口（仅对已启动会话的行，与 Open Session 同条件），点击在该行 `dt-row-main` 内展开唯一的内联表单（textarea + 提交 + 取消），提交发 `POST local/issues/:id/questions`（body `{ ticket, text }`）后经 `act()` 重读详情并收起表单；时间线新增 `dt-question` 事件（按 `askedAt` 参与 newest-first 排序）：`工单：<标题>` 标签 + 时间 + 状态标签（等待回答…/已回答/回答失败）+ 问题 Markdown；`answered` 在独立 `dt-question-answer` 块用 `MarkdownLite` 渲染回答；`failed` 显示 `error` 原因与 **重试提问** 按钮（`POST local/issues/:id/questions/:questionId/retry`）；`Section` 计数含问题事件 |
| `src/client/locales.ts` | 9 条 `discuss.*` 中英双语键：`ask`、`askPlaceholder`、`askSubmit`、`questionOf`、`questionAsked`、`questionAnswered`、`questionAnswer`、`questionFailed`、`questionRetry`（`{title}` 两侧一致） |
| `tests/panel-discuss.spec.tsx` | 5 个新用例（下附名称），并加 5 个复用取值的测试辅助函数；既有 31 个用例未改 |
| `docs/005-panel.md` | Requirements 行写入提问入口、等待/回答/失败重试、所属工单标签、与 Open Session 共存、不进 Engine、轮询可见 |
| `docs/007-architecture.md` | `src/client/discuss.tsx` 模块行与 `tests/panel-discuss.spec.tsx` 测试行同步本切片语义 |

本分支还包含 C4 的提交（`2eaa51cc`、`3a1626cc`），提供 `LocalQuestion`、两条 HTTP 路由与后台队列；C5 只消费该契约，未改 `src/app/http.ts`、`src/app/local-questions.ts`、`src/sources/local-format.ts` 与 `tests/fixtures/panel-server.ts`（`git diff 3a1626cc -- <those paths>` 为空）。

## 双轴评审

### Standards 轴

结论：**通过（approve）**，两处 UI 收敛（见上）后无 must-fix。

- **契约消费方而非所有者**：面板只发 C4 冻结的两条路由，请求体字段是 `ticket`（C4 契约），不复制宿主的校验、上限或队列语义；回答的落地与重试都由宿主记录状态，面板只渲染 `asked/answered/failed`。
- **时间线模型**：问题不是 Trigger——面板不把它们塞进 `data.thread.timeline`，而是在渲染期与既有 Trigger/回复合并成同一组事件，按 `askedAt`/`at`/`sentAt` 统一 newest-first 排序；需求原文的 Trigger 仍被排除，因此原文、问题、回答在页面上各出现一次。`Section` 的 count 与事件数一致（测试断言 4/4、1/1）。
- **入口条件与拒绝语义一致**：宿主以 `questionNoSession` 拒绝未启动会话的工单，面板因此只在 `ticket.sessionId` 非空的行给出入口，与既有 Open Session 完全同条件（同一行既有测试仍绿）；打开提问框时该行入口隐藏，同一行不会出现两个表单。
- **状态可见性**：`asked` 只保留一个等待标签（不再重复一段等待文案）；`answered` 的回答在独立块里由 `MarkdownLite` 渲染（测试断言 `strong` 与 `ul li`，不只是文本包含）；`failed` 的原因用 `role="alert"` 呈现并配重试按钮；重试后记录回到 `asked`，失败条目与其按钮随之消失（测试断言）。
- **与既有交互共存**：提交与重试都走页面既有的 `act()`（统一 busy 与 `reload()`），失败时 `notify` 显示本地化原因、表单内容保留；评论框、执行方式开关、确认/打回、关闭需求、Open Session 的行为与断言均未改。
- **无障碍与文案**：表单控件有 `placeholder` + `aria-label`；按钮是可见文案的 `Button`；9 个键中英占位符一致（`tests/locales.spec.ts`）；没有把可见文案硬编码在组件里。
- **样式零侵入**：只用既有 `dt-form`/`dt-textarea`/`dt-actions`/`dt-row-actions`/`dt-row-main`/`dt-event`/`dt-subhead`/`dt-section-title`/`dt-error`，新增的只有用于断言与文档指代的 `dt-question`、`dt-question-ticket`、`dt-question-answer`、`dt-question-failure` 标记类，没有改 `src/client/client.css`。
- **测试质量**：用例断言用户可见结果与请求契约（行内两个按钮的顺序、请求 path/body、时间线文本与顺序、Markdown 真渲染、计数、去重）；不耦合内部 state 或实现细节；中英双语各覆盖一次入口标签；`server.misuse` 保持为空（无未声明 query、无对无 body 路由发 body）。
- **有界与依赖**：textarea `maxLength={4000}` 与宿主 `QUESTION_CHARS` 同值（面板不 import `src/app/*` 运行时代码，故以注释与文档记录该对齐）；本切片没有新增依赖。

### Spec 轴（逐条对照冻结验收标准）

1. **`tests/panel-discuss.spec.tsx`：关联工单行有提问入口；提交发出 `POST local/issues/:id/questions`（body 含 ticketId 与文本）；`asked` 显示等待；`answered` 渲染 Markdown 回答；`failed` 显示原因与重试按钮且点击发出重试请求；问题与回答在时间线各出现一次并标注所属工单**：通过。
   - `offers Ask beside Open Session only on a linked Ticket that started a Session`：同一行动作区恰为 `[打开 Session, 提问]`，未启动会话的行只有标题按钮；英文重挂载后两个标签仍在同一行。
   - `asks about one linked Ticket and shows the question waiting in the message timeline`：空/空白禁用、提交后 `POST local/issues/q-fixture/questions` 且 body 恰为 `{ ticket: 't1', text: 'Why is CI red?' }`；详情重读一次、表单收起；时间线出现一条 `dt-question`，含 `工单：修复回归`、问题文本与 `等待回答…`，计数为 1，且需求原文没有再出现。
   - `renders an answered question with its Markdown answer and its Ticket label`：`已回答` + `回答` 块，`strong` 为 `CI`、`ul li` 为 `第一条`，问题与回答文本各出现一次。
   - `shows a failed question with its reason and retries it from the timeline`：原因文本与 `重试提问` 都在；点击后发出 `POST .../questions/qn-1/retry`（无 body），记录回到 `asked`，等待标签出现、失败原因与按钮消失，问题文本仍只出现一次。
   - `shows every message, question and answer once in newest-first timeline order`：4 条事件按 `asked/asked/回复/评论` 时间倒序排列，5 个 `.dt-md` 文本各出现一次，两个问题事件都带所属工单标签，需求卡片里不含问题文本。
2. **`docs/005-panel.md` 写明提问与回答；`docs/007-architecture.md` 更新本需求涉及模块的行文；`pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts` 通过**：通过。两处文档见变更范围；定向 3 files / 58 tests 全绿（`docs/issues/evidence/c5/c5-targeted.log`），`tests/docs.spec.ts` 的 Modules/Tests 表双向校验仍通过（未新增文件，只改描述）。
3. **`pnpm check` 在最终 head 通过**：通过。`env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check`（typecheck + 全量 vitest + build），见 `docs/issues/evidence/c5/c5-check.log`；机器相关的既有失败说明见下“风险与限制”。
4. **PR 描述含同视口、同主题的 before/after 截图并标注基线/改动版本，且说明与「打开 Session」按钮共存**：通过。同一 seeded state（1 个项目、1 条需求、3 张关联工单、2 条问答记录）、同一视口 1440×900、同一浅色主题、同一滚动位置，Before = `3a1626cc`（C4 合入后、C5 之前），After = 本工单 head：`before-tickets.png`/`after-tickets.png` 证明每行 `打开 Session` 与 `提问` 并排；`before-timeline.png`/`after-timeline.png` 证明时间线新增问题与回答；`after-composer.png` 展示内联提问框。截图与抓取日志在 `docs/issues/evidence/c5/`，seed 脚本 `c5-questions-seed.mjs` 可复现。

## 测试证据

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts` | 3 files / 58 tests passed，exit 0 | `c5-targeted.log` |
| `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/questions.spec.ts tests/class-docs.spec.ts` | 4 files / 56 tests passed，exit 0 | `c5-related.log` |
| `pnpm typecheck` | exit 0 | `c5-typecheck.log` |
| `pnpm build` | exit 0 | `c5-build.log` |
| `env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm check` | exit 0，见日志 | `c5-check.log` |

## 风险与限制

- **字段名与判据用词**：冻结判据写的是“body 含 ticketId”，C4 冻结的宿主契约字段是 `ticket`；面板按宿主契约发请求（否则真实宿主 400），测试断言 `{ ticket: «工单 id», text }`。这是同一语义的字段命名差异，已在切片 issue 与本文件中记录。
- **等待态在截图中不可复现**：seeded 的 `asked` 记录会在宿主启动时被 `resume()` 重新处理，随即因为没有真实 worker 会话落 `failed`，所以截图只呈现 `answered` 与 `failed`；`asked` 的等待渲染由面板用例覆盖。
- **Stacked PR**：C4（PR #37）尚未合并，本分支含其提交，diff 在 #37 合入前会包含 C4 的改动；合并顺序应为 #37 先、本 PR 后。
- **机器环境相关的既有失败**：不带 `env -u GIT_CONFIG_GLOBAL` 时 `tests/runtime.spec.ts` 的“without mutating the host environment”两个用例失败（代理会话注入了该变量）；未设 `LC_ALL=C` 时 `tests/environment.spec.ts` 的 git 配置用例因中文 locale 输出不匹配失败。两者都与本切片无关，`pnpm check` 证据用干净环境跑出。
