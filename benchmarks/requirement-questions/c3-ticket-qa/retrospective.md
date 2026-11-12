# Retrospective · C3 工单问答会话

## 做对了什么

- **先定端口契约再实现**：任务契约把 `QuestionResult`/失败原因、fork 边界读取、归档位置、`Sessions.answer` 的装饰职责和夹具能力都写死，lane 一次实现即通过冻结验收，worker 复核未发现需要返工的行为问题。
- **只读由结构保证**：`src/app/questions.ts` 不导入 Engine、不读 Store，只调用 `sessions.answer`/`prompt` 和会话域 API，因此"提问不改工单"不需要靠逐条断言兜底，测试只做确认。
- **夹具可观测性先补后测**：给 fake host 加 per-Session 事件、systemPrompt section、`tools.restrict` 白名单、`fork`、`archiveSession`，测试直接断言装饰契约，不用反射 `Sessions` 内部。
- **复用 DSH 既有语义**：fork 省略 `atSeq` 即取最近完成回合；答案用 `inheritedEventCount` 边界过滤，避免误取 worker 旧消息；归档用 `archiveSession(..., { stopActivity: true })` 而不是自己停会话。

## 踩过的坑

1. **lane 模型路由**：给派发显式指定 `deepseek-v4.1` 不在可用子 agent 模型目录里，lane 无输出直接失败。重派时不指定 model（继承父路由）即可。教训：派发前用 `list_subagent_models` 确认目录，或干脆继承。
2. **宿主重启打断工单**：assignment 被 `hostRestarted` 结束、进入第二个 assignment。由于实现未提交但工作树完整、run 状态在 `feature-exec/runs.json` 持久化，恢复时只需检测 `git status` 与 run 状态，不重复实现。
3. **main 在跑的过程中前进**：另一个 slice 把 `EXECUTE_TOOLS` 从 `sessions.ts` 移进 `execution-strategy.ts`，合并时四处冲突全是加性（docs 行、context 常量、prompts import、sessions 常量）。解决方式是保留对方结构、只保留自己的 `ANSWER_TOOLS`。交付前必须 merge 当前 main 再复跑。
4. **`orchestrator_report` 的 PR 绑定对 app 账号失效**：`claimPull` 用 `sameName(pr.user.login, deployment.github.login)` 严格比较，而 app 创建的 PR 作者是 `app/rust-crane-agent`；同仓库既有 slice 的 ticket 也都是 `follows: null`。PR 编号只能走 summary 里的 URL，或按工具提示省略 `pr_number`。
5. **宿主环境干扰全量测试**：`GIT_CONFIG_GLOBAL`/`LANG` 让 3 个环境用例失败，必须在干净环境下跑全量才能作为证据；基线同样复现，不能在 slice 里"顺手修"。

## 留给 C4/C5 的约束

- 提问必须走 `Questions`；任何其他方式 fork 出的会话不会被 `Sessions.answer` 装饰，会带着 worker preset 的完整工具集。
- `whenIdle()` 的 reject 目前被当作回合结束，异常回合会落到 `empty-answer`；C4 记录 `failed` 时应把 message 一并保留。
- `QuestionsHost.store` 暂未被端口读取，C4 组装时可保留（宿主形状）或删除。
- 真实 fork/cancel/archive 与回答质量只能在部署实例人工验证一次（对齐方案总体验收第 5 条）。
