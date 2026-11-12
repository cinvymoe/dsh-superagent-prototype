# 可复用模式 · C5

## 1. 只做消费者的面板切片

当宿主契约由另一个 slice 冻结（C4 的 `LocalQuestion` 与两条路由）时，面板切片应当：

- 以该 slice 的提交为父（`git merge agent/<C4 分支>`），让类型与假服务夹具都到位；
- 不改宿主的记录、队列、HTTP 与端口，`git diff <C4 head> -- src/app src/sources tests/fixtures/panel-server.ts` 应为空；
- 在 PR 里写明 stacked 关系与合并顺序。

## 2. 面板事件的时间线合并

不把新记录塞进 `data.thread.timeline`（那是 Trigger 的时间线），而是在渲染期把三种来源合成一组事件、用各自的 `at` 排序：

```tsx
const events = [
  ...timeline.flatMap((trigger, index) => index === skipped ? [] : [{ at: trigger.at, kind: 'trigger', trigger }]),
  ...replies.map(reply => ({ at: reply.sentAt ?? '', kind: 'reply', reply })),
  ...(issue.questions ?? []).map(question => ({ at: question.askedAt, kind: 'question', question })),
].sort((a, b) => b.at.localeCompare(a.at))
```

好处：需求原文去重、newest-first 顺序、Section 计数都只有一处真源；测试可以直接断言「每个文本出现一次」。

## 3. 入口条件与宿主拒绝条件同源

宿主对未启动会话的工单返回 `questionNoSession`；面板因此用与 Open Session 完全相同的条件（`ticket.sessionId` 非空）决定是否给出入口，而不是先给入口再显示拒绝。UI 条件与宿主校验一一对应，测试两行（有/无会话）即可锁住。

## 4. 单一内联表单

一行一个入口、全页只有一个打开的表单：`asking === ticket.id` 决定表单位置，打开时隐藏该行自己的 Ask 按钮（否则同一行会出现两个表单）；提交成功才收起并清空草稿，失败保留草稿并 toast 本地化原因。

## 5. Markdown 真的渲染要断言结构

断言 `document.querySelector('.dt-question-answer strong')` / `ul li`，不要只断言 `textContent` 包含——后者在 `MarkdownLite` 被替换成纯文本时仍会通过。

## 6. 截图证据的可复现骨架

`seed.mjs`（直接写 sqlite 的 kv/trigger/thread/ticket/outbox 表）→ 两个只差链接树/端口/stateDir 的 dsh profile → `dsh --profile <name> --no-open` 拿 token URL → Playwright 按 section 顶部滚动截图。同视口、同主题、同 seed，才能做有意义的 before/after。
