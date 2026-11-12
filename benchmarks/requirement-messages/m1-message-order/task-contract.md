# 任务契约 · M1 需求详情消息记录倒序 + 回复框上移

- Slice issue: `docs/issues/b92376fc87045bdd661562973b8aff37.md`
- Ticket: `b92376fc87045bdd661562973b8aff37`（alignment `q-627a7e26`，slice `M1`）
- Dispatch cwd: `/data/project/workspace/dsh-worktrees/slice-b92376fc8704`
- Tier: T1；lane edit 范围见 §文件集，禁止越界。

## 目标

需求详情页 `RequirementDetail`（`src/client/discuss.tsx`）的「消息记录」：

1. 排序改为**最新在前**：`events` 由 `a.at.localeCompare(b.at)` 改为 `b.at.localeCompare(a.at)`；`Section count` 仍为 `events.length`。
2. 补充信息表单（textarea + 提交按钮）移到 `<ul className="dt-list dt-timeline">` **之前**，仍是该 `Section` 的子节点，输入后提交走既有 `commentSubmit`（`POST local/issues/:id/comments`），提交后 `reload()` 让新消息落在第一条。
3. 保留既有行为：原始需求 Trigger 仍从时间线剔除（`skipped`/`isOriginal`）；智能体回复仍显示 `discuss.agent` 标签；`commentSubmit` 空/纯空白直接返回，提交按钮 `disabled={busy || !comment.trim()}`。

不改排序之外的展示逻辑，不新增图标/配色/字号；表单与列表之间如需间距，只加一条 `.dt-timeline-form { margin-bottom: 8px; }` 之类的 class 规则（`tests/styles.spec.ts` 要求 class 被组件使用、一行一条规则）。

## 文件集

- `src/client/discuss.tsx`（面板实现：排序方向、表单位置）
- `src/client/client.css`（仅当需要表单与列表间距时新增一条规则）
- `tests/fixtures/panel-server.ts`（fixture 忠实镜像宿主）
- `tests/panel-discuss.spec.tsx`（面板测试）
- `docs/005-panel.md`、`docs/007-architecture.md`（文档）
- `tests/docs.spec.ts`（文档断言）

不触碰：`src/app/*`、`src/sources/*`、引擎与存储、其它面板页、`docs/issues/*`（由我记录）。

## fixture 要求（宿主语义）

宿主 `LocalIssues.comment` 只更新 `updatedAt` 并 `receive(localTrigger(...))`：**不改写 `issue.body`**。现有 fixture 的 `POST local/issues/:id/comments` 会把评论追加到 `issue.body`，必须改为：

- 服务端新增按需求 id 索引的预设数据（如 `localComments: Record<string, TriggerRow[]>`、`localReplies: Record<string, Receipt[]>`），`initial()` 初始化为空。
- `localThread(issue, extra)` 的时间线 = 原始需求 Trigger + `extra`。
- `GET local/issues/:id` 返回 `thread: server.threadPages('local:<id>', {}) ?? localThread(issue, server.localComments[id] ?? [])` 与 `replies: server.localReplies[id] ?? []`。
- `POST local/issues/:id/comments`：`text = body.text.trim()`；`at` 用确定性时间（晚于任何预设时间，如 `new Date(Date.UTC(2026, 8, 24, 0, 0, 既有评论数)).toISOString()`）；更新 `updatedAt`；把该评论作为人类 Trigger 追加进 `localComments[id]`；返回更新后的 issue。
- 导出 `localComment(issue, text, at)` 与 `localReply(issue, text, sentAt)` 供测试构造预设消息（`Receipt` 类型从 `src/app/store.ts` 以 `import type` 引入）。

## 测试要求（`tests/panel-discuss.spec.tsx`）

1. **顺序**：预设 2 条人类消息 + 1 条智能体回复（时间各不相同），断言 `.dt-timeline` 内的正文顺序为最新→最早；智能体行含 `discuss.agent` 标签；原始描述不在时间线内且全页只出现一次；`Section` 的 `.dt-count` 等于行数。
2. **输入框位置**：在同一 `Section` 内用 `form.compareDocumentPosition(ul.dt-timeline) & Node.DOCUMENT_POSITION_FOLLOWING` 断言列表在表单之后。
3. **提交置顶**：空/空白输入时提交按钮 `disabled`；填入文本后 `click` 提交，断言 `POST local/issues/q-fixture/comments` body 为 `{ text }`；重新拉取后新消息为第一条、`.dt-count` 加一、textarea 值清空。
4. **中文/英文渲染**：`remount(en)` 后断言 `en` 文案出现，且 `text()` 不含 `discuss.`（无缺失 key）。

## 文档要求

- `docs/005-panel.md` 的 Requirements 行：说明消息记录最新在前、补充信息框在列表上方、提交后新消息出现在顶部且计数增加、输入框清空。
- `docs/007-architecture.md` 的 `src/client/discuss.tsx` 行与 `tests/panel-discuss.spec.tsx` 行同步该行为。
- `tests/docs.spec.ts` 新增 describe：用 `prose()` 断言上述两句（空白折叠后的整句）。

## 验收命令

```bash
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/docs.spec.ts tests/styles.spec.ts tests/locales.spec.ts
pnpm check
```

全部通过后回报：改动文件、命令输出摘要（已知失败要贴原始报错）、任何未覆盖点。不要 commit / push / 开 PR（由主 agent 负责）。
