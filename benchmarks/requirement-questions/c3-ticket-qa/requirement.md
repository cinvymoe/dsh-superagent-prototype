# Requirement snapshot · C3 工单问答会话（fork，只读、一次性）

## 需求原文（alignment `q-29218185`）

> 需求列表 讨论 支持 对齐历史 记录。比如我回复 需要修改什么地方 后生成新的对齐记录。
> 2 可以 对齐的工单进行提问。并接收提问反馈。 看看如何 完善。如果判断是 提问能否 使用 fork session 提问 然后 反馈到讨论列表

## 冻结的 C3 决定（摘自对齐方案）

- 回答来自从 `worker-<ticketId>` 分叉出的一次性问答会话：注册专门问答系统提示，只允许 `read / read_image / glob / grep` 只读工具，不写文件、不跑 bash、不启动 feature-exec；答完归档该会话。
- 工单从未启动会话时拒绝提问；无完成回合、fork 失败或超时 → 返回带原因的失败（C4 记录 `failed` 并可重试）。
- 提问**不进 Engine**：不产生 Trigger/Eval/Ticket/Assignment，不唤醒、不 resume、不修改工单。
- 备选已否决：把问题当 Ticket Input（会 steer 正在跑的 worker、结束的工单还要 resume，问答混进工作状态）；新建空上下文会话（拿不到 worker 的推理与文件）。
- 范围外：需求记录 `questions[]`、后台队列、重启重排、HTTP API（C4）；面板入口与时间线（C5）；答案质量调优、多轮追问。

## 冻结验收标准（本 slice）

1. `tests/questions.spec.ts`：对已有完成回合的工单返回回答文本；无会话、无完成回合、超时三条路径返回带原因的失败；问答前后 `store.tickets` 中该工单不变（inputs/assignments/ended 不变）。
2. 问答会话注册的工具白名单恰为 `read`/`read_image`/`glob`/`grep`，系统提示含问答指令；回答结束后该会话被归档。
3. `docs/007-architecture.md` 模块表与测试表包含新文件，`pnpm vitest run tests/questions.spec.ts tests/model-surface.spec.ts tests/docs.spec.ts` 与 `pnpm typecheck` 通过。
