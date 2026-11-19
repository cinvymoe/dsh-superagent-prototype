# Agent 运行时：提示怎么注入，主 Session 怎么把活交给 Worker

前一章（[`004-prompts.md`](004-prompts.md)）讲的是「拼出来的提示长什么样、有哪些段」。这一章讲两件常常被混在一起的事：

1. **注入的时间线**——那些段落在什么时刻被写进上下文，为什么改设置能立刻生效。
2. **派发的时间线**——主 Session 决定做事之后，一个 Worker Session 是怎样被建起来、被喂第一句话、跑完再回到主 Session 视野里的。

一句话版本：**提示在每次模型请求前重拼一次，不是启动时灌一次；Worker 不是「被调用」，而是被排进一条持久队列，由执行器建好 Session 之后投喂第一条消息。**

对应的图：[`diagrams/agent-view.html`](../diagrams/agent-view.html)（每个角色看见什么）、[`diagrams/agent-flow.html`](../diagrams/agent-flow.html)（一次建立、每轮重拼、收工后落地）。

---

## 1. 提示注入：一条时间线

### T0 · 进程启动

提示词被读入并编号成一个版本（`revision`）。`Settings`、`Sources`、`Setup` 同时就位。此后任何一次「设置 → 提示词」保存都会产生新的 `revision`，旧版本仍然可读（用于排查与历史回看）。

### T1 · Session 建立（一次）

`Sessions.ensure()`（`src/app/sessions.ts:165`）做五件事，顺序固定：

| 步骤 | 做什么 | 位置 |
|---|---|---|
| 1 | 解析或创建 DSH Session，绑定 preset（`ROUTER_PRESET` / `WORKER_PRESET`） | `sessions.ts:165-186` |
| 2 | 按角色初始化模型：项目覆盖层 `settingsFor(settings, project)` 之后取 `roleModel(settings, 'main' \| 'worker' \| 'aligner' \| 'answerer')`；`align` 工单的角色是 `aligner` | `sessions.ts:183-185` |
| 3 | `decorate(agent)`：挂提示段回调、绑技能作用域、注册工具与白名单 | `sessions.ts:300` |
| 4 | 权限预设设为 `danger-full-access` | `sessions.ts:186` |
| 5 | 重命名 Session（标题即工单标题或讨论标题） | `sessions.ts:187` |

`decorate` 里的关键一句是**注册一个回调，而不是注册一段文本**：

```ts
agent.ctx.systemPrompt.section({ name: 'dsh-superagent-policy', order: 9999, interpolate: false,
  text: context => { /* 每次请求在这里拼 */ }, ...(master ? { complete: true } : {}) })
```

- `text` 是函数，DSH 每次组装系统提示时才调用它；
- `order: 9999` 让它排在最后（主 Session 的 `runtime/policy` 段因此永远压轴）；
- `interpolate: false` 保留提示里字面的 `${{ ... }}` 表达式；
- `complete: true` 只给主 Session：主 Session 的系统提示**整份**由这里给出，不再叠加 preset 自带的角色说明。Worker 是叠加式的，preset 那层仍在。

同一时刻还做了两件与提示无关但同样「一次」的事：把当前版本的技能注册进该 Session 的技能作用域（`bindSkills`，`sessions.ts:521`），以及按角色算出工具白名单（`installTools` + `workOnly`，`sessions.ts:458`）。

### T2 · 每次模型请求（每次都重拼）

DSH 组装系统提示 → 调到上面的 `text(context)` → 依次发生：

1. `promptFor(agent, context.signal !== undefined)`（`sessions.ts:536`）取**当前**版本；`bind` 为真时把 revision 记进 `KV.sessions.prompts`，并在版本变化时重注册技能（技能也跟着版本走）。
2. 按角色选组合函数（`src/app/prompts.ts`）：

| Session | 组合 | 说明 |
|---|---|---|
| 主 Session | `compose(config, 'orchestrator', env)` | 完整覆盖，含 `dispatch`、`admission`、`policy` |
| 讨论 Answerer | `composeDiscuss(config, [])` | worker 基座减去 `worker`/`work`/`replies`/handoff，末尾 `discuss.md`，没有实施授权 |
| 对齐 Aligner | `composeAlign(config, env)` | worker 基座减去 `worker`/`work`/`replies`/handoff，末尾 `align.md`，只提案 |
| 切片 Worker | `composeExecute(config, strategy.mode, env)` 或 `compose(config, 'worker', env)` | 前者带执行策略，后者直接实施 |
| 单题 Answerer | `composeAnswer(config)` | `shared` + `answer.md`，只回答一题 |

3. 段序固定（`prompts.ts:110-120`）：`shared` → 角色段 → 团队三段（Communication / Ticket scope / Delivery requirements）→ `subscriptions` → `replies` → `dispatch`（主）或 `work`（worker）→ `admission`（仅主）→ `handoff` → `environment`（设置里的变量，每次现取）→ `policy`（仅主，现取规则、accept 模式与版本号）。
4. 返回值首行是 `[dsh-superagent prompt revision N]`，worker/aligner 末尾再追加 `mandateInstructions(ticket.mandate)`——**这一单的具体活只从这一处进入系统提示**。

所以：改一条规则、改一个环境变量、换一个模型，下一次请求就生效；不需要重启，也不需要等这一单结束。代价是每请求多一次字符串拼装（实测一个角色的系统提示 27K–32K 字符）。

### T3 · 工具调用回合

模型输出一次工具调用 → 宿主执行 → 结果作为工具结果回到同一轮上下文。工具本身在 T1 就注册好了，不在提示里；提示里只有它们的存在与协议说明。

### T4 · 写回与回报之后

工具的写操作落进 store（`Ticket` / `Decision` / `Discussion`），并可能入队一个 effect。effect 是持久队列（`src/app/effects.ts`），不是即时调用，因此重启不丢。

---

## 2. 主 Session 调 Worker：九个动作

这一节回答「一个需求是怎么变成某台机器上的一个 Worker Session 的」。全部动作都在一条持久链上，没有一步是内存里的临时调用。

### ① Trigger 落地

面板提交、GitHub、飞书、定时都先变成一条 `Trigger` 落库，再进评估队列。

### ② 主 Session 决策

主 Session 在一次普通模型请求里调用 `orchestrator_route`，`kind: 'accept'`（`mode` 可选 `work` / `align`）。这一步没有特权通道：它仍然是一次工具调用。

### ③ 引擎建单

`Engine.decide()` → 接受路径（`src/core/evals.ts`）依次：记 `Decision` → 建 `Mandate`（范围、验收、约束）→ `tickets.create()`（`src/core/tickets.ts:37`）→ 写 `Assignment` → 订阅线程 → 回执（`acknowledgeAccepted`）→ `executor.start(ticket)`。`tickets.create` 的同一个事务里已经调用了 `prepareTicket`，因此工单落库时执行环境已经定好（目录、worktree 根、prepare 命令、项目覆盖的模型）。

### ④ 入队 `launch`

`executor.start` 只做一件事：`effects.enqueue('launch', assignment.id, …)`（`src/executor/dsh.ts:327`）。`launch` 的处理函数带并发上限 `limit: () => host.paused() ? 0 : this.launches()`——上限是两个槽池各自「上限减去正在跑的与已预留的槽位」之和：执行工单用 `maxWorkers` 个 worker 槽，对齐工单用固定 2 个 aligner 槽（`ALIGN_CONCURRENCY`），两者互不占用。槽满时 `launchQueued` 抛 `Later`，effect 留在队列里按序重试。

### ⑤ `launchQueued` 的闸门

`dsh.ts:332`：

- 工单已结束或有更新 assignment → 静默丢弃；
- 计划切片的依赖还没结束 → `Later`；
- 该项目被暂停（`settingsFor(settings, ticket.project).paused`）→ `Later`；
- 否则按工单的 `mode` 选池（`align` → aligner 池，其余 → worker 池），`reserve(ticketId, 'launch')` 抢槽，抢不到抛 `Later`。

### ⑥ `launch()`：造环境、造 Session、喂第一句

`dsh.ts:491`：

1. `prepareDirectory(ticket)`——目录不存在才跑（worktree 根、`prepare` 命令、超时与失败即 `PrepareFailed`，不重试）。
2. `sessions.ensure(workerSessionId(ticket.id), workspace, ticket.title, ticket.mode === 'align' ? 'aligner' : 'worker', undefined, ticket.project)`——建 Session 并完成 T1 的全部装饰（提示回调、技能、工具、模型、权限）。对齐工单的 Session 名仍是 `worker-<id>`，但角色、提示与只读工具面都是 aligner 的。
3. `stopped(ticket.id)` 等上一份 assignment 的后台工作停下。
4. 组装第一条用户消息（JSON，不是散文）：`{ ticket_id, title, assignment, trigger: 卡片, batch }`；已经被喂过就只发增量 `{ ticket_id, assignment }`。
5. `sessions.prompt(sessionId, requestId, text, 'queue', authorize, () => engine.assignmentStarted(...))`——**投喂与状态转移在同一个授权回调里**，投喂前还会再校验一次工单仍然有效。

到这里才真正跑起来。系统提示在 T1 就挂好了，这条 JSON 是「用户消息」，mandate 是系统提示的尾巴，两者不是一回事。

### ⑦ Worker 干活

每次模型请求都走 T2（重拼提示）。它调用 `orchestrator_report` 汇报 `progress` / `ready` / `blocked` / `failed`，或在需要人回答时带 `question` 触发 attention。报告经 `engine.report` 写库。

### ⑧ 回到主 Session 视野

报告写入触发领域事件 → `Runtime` 的 `emit` 回调（`src/app/runtime.ts:186`）→ `reportRelay()`（`src/app/notices.ts:118`）决定要不要告诉主 Session：

- `progress` 且没有回答 → 不打扰；
- `ready` / `blocked` / `failed` / 带 `answers` → `resultRelay`，入队 `relay`（有序 effect）；
- 带 `question` → `worker_attention` 提醒。

`relay` 的处理函数是 `sessions.prompt(masterId, requestId, text, 'steer')`（`sessions.ts:126`）——**steer 模式会唤醒主 Session**。与之相对，`notice` 用 `{ inject }` 只注入、不唤醒（`sessions.ts:243`），用于「顺带知会」的事件，例如工单结束、订阅变更。

主 Session 收到后可以：`orchestrator_reply` 回答、`orchestrator_ticket_note` 留话、`orchestrator_ticket_retry` 重派、`orchestrator_ticket_request_status` 追问、`orchestrator_thread_unsubscribe` 退订。

### ⑨ 收工与落地

`ready` 且 PR 已合并 → `ticket.ended(outcome: 'merged')`。这一个事件同时引出三件事：

1. `eventNotice` → 主 Session 的结束通知（`inject`，不唤醒）；
2. `pullEndNotices` → 回到 PR 所在对话的留言（outbox）；
3. 若策略 `policy.delivery.land === 'merge'` → 入队 `deploy`，由 `Landing` 拉取、重建，并请宿主 supervisor 重启（见 [`006-deployment.md`](006-deployment.md)）。

### 失败与等待的情形

| 情形 | 结果 |
|---|---|
| 目录准备的命令失败 | `PrepareFailed`，工单标记失败，不自动重试 |
| 槽位满 / 暂停 / 依赖未完成 | `Later`，effect 留在队列，按序再来 |
| 网络/供应商瞬时错误 | 有限次退避重试，超出后 `launchFailed` |
| 人工追问（`by === 'person'`） | 允许越过上限占一个额外槽，排在所有新启动之前 |

---

## 3. 三个容易混淆的点

1. **`relay` 唤醒，`notice` 不唤醒。** 前者是「有人跟你说话」，后者是「顺手让你知道」。
2. **`complete: true` 只给主 Session。** 其它角色的系统提示是叠加在 preset 之上的；这也是为什么 Worker 能保留工具与工作方式，而主 Session 的整份提示由 `compose` 决定。
3. **Aligner 与讨论 Answerer 都不占 Worker 槽。** Aligner 跑在对齐工单的只读 Session 里，占 aligner 池（固定 2 个，`ALIGN_CONCURRENCY`），`GET state` 的 worker load 只数执行工单；讨论 Answerer 跑在 `ensureAnswerer` 的只读 Session 里，工具是只读族加 `discussion_ask`，永远不会建 Ticket。

---

## 4. 读代码的入口

| 想知道 | 看哪里 |
|---|---|
| 提示段落顺序、组合函数 | `src/app/prompts.ts`（`promptParts`、`compose*`） |
| 注入回调、版本绑定、技能与工具白名单 | `src/app/sessions.ts`（`decorate:300`、`promptFor:536`、`bindSkills:521`、`workOnly:458`） |
| 派发、槽位、首条消息 | `src/executor/dsh.ts`（`reserve:238`、`launchQueued:332`、`launch:491`） |
| 回报与唤醒 | `src/app/notices.ts`（`reportRelay:118`、`eventNotice:48`）、`src/app/runtime.ts:186` |
| 效果队列语义 | `src/app/effects.ts`（`enqueue` / `handle` / `Later`） |
| 工单落库与 assignment | `src/core/tickets.ts:37`、`src/core/evals.ts` |
