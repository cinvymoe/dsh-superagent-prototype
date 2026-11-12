# 需求快照 · C5 · 面板提问入口、回答时间线与文档收口

- Alignment issue: `q-29218185`（Discuss 面板已确认，`decidedAt` 2026-11-12T16:09:39.804Z）
- Ticket: `96d585fa7995596f6c339a86778335e4`
- 需求原文：

> 需求列表 讨论 支持 对齐历史 记录。比如我回复 需要修改什么地方 后生成新的对齐记录。
> 2 可以  对齐的工单进行提问。并接收提问反馈。  看看如何  完善。如果判断是 提问能否 使用 fork session 提问 然后 反馈到讨论列表

## 本切片交付（C5）

需求详情的「关联工单」每一行提供提问入口（与「打开 Session」并存）；提问后时间线显示问题（等待 / 失败可重试）与标注所属工单的回答；文档同步，全量检查通过。

## 冻结验收标准

1. `tests/panel-discuss.spec.tsx`：关联工单行有提问入口；提交发出 `POST local/issues/:id/questions`（body 含 ticketId 与文本）；`asked` 显示等待；`answered` 渲染 Markdown 回答；`failed` 显示原因与重试按钮且点击发出重试请求；问题与回答在时间线各出现一次并标注所属工单。
2. `docs/005-panel.md` 写明提问与回答；`docs/007-architecture.md` 更新本需求涉及模块的行文；`pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts` 通过。
3. `pnpm check` 在最终 head 通过。
4. PR 描述含同视口、同主题的 before/after 截图并标注基线/改动版本，且说明与「打开 Session」按钮共存。

## 上游依赖

- C3（已合并，PR #32）：`Questions.ask` 从工单 worker 会话 fork 一次性只读会话回答。
- C4（PR #37，本分支父提交）：`LocalQuestion`、`POST local/issues/:id/questions`、`POST local/issues/:id/questions/:questionId/retry` 与后台队列。
