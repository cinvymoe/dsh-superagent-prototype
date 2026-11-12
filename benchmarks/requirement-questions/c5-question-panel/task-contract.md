# 实现契约 · C5 T1

## 目标

需求详情的「关联工单」每一行提供提问入口；提问与回答进入消息记录时间线（等待 / Markdown 回答 / 失败原因 + 重试），并标注所属工单。只做面板，不改宿主。

## inScope

- `src/client/discuss.tsx`
- `src/client/locales.ts`
- `tests/panel-discuss.spec.tsx`
- `docs/005-panel.md`
- `docs/007-architecture.md`

## 契约

- 入口条件：`ticket.sessionId` 非空（与 Open Session 同条件），与 `SessionButton` 同一 `dt-row-actions`，入口文案 `discuss.ask`。
- 表单：该行 `dt-row-main` 内的唯一 `<form class="dt-form dt-question-form">`；textarea（`maxLength` 4000，placeholder/aria-label = `discuss.askPlaceholder`）、提交（`discuss.askSubmit`，空白或 busy 时禁用）、取消（复用 `cancel`）。打开时隐藏该行自己的入口。
- 提交：`POST local/issues/:id/questions`，body `{ ticket: <工单 id>, text: <trim 后文本> }`；成功经 `act()` 重读详情、收起表单、清空草稿；失败 toast 本地化原因并保留草稿。
- 时间线：`events` = 线程 Trigger（排除需求原文）+ 已发送回复 + `issue.questions`，全部按 `at`（`askedAt`/`sentAt`/`at`）newest-first；`Section` 计数含问题事件。
- 问题事件：`<li class="dt-row dt-event dt-question">`，meta 含 `dt-question-ticket`（`discuss.questionOf`，{title}=工单标题，找不到时用 id）、`When`、状态标签（`discuss.questionAsked` / `questionAnswered` / `questionFailed`）；问题文本 `MarkdownLite`。
  - `answered`：独立 `dt-question-answer` 块，标题 `discuss.questionAnswer`，回答 `MarkdownLite`。
  - `failed`：`dt-question-failure` 块，`question.error` 用 `role="alert"`，按钮 `discuss.questionRetry` → `POST local/issues/:id/questions/:questionId/retry`（经 `act()`）。
- 文案键（中英占位符一致）：`discuss.ask`、`askPlaceholder`、`askSubmit`、`questionOf`、`questionAsked`、`questionAnswered`、`questionAnswer`、`questionFailed`、`questionRetry`。
- 不改 `src/app/*`、`src/sources/local-format.ts`、`tests/fixtures/panel-server.ts`、`src/client/client.css`。

## 验收命令

```sh
pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/questions.spec.ts tests/class-docs.spec.ts
pnpm typecheck
```

## 执行结果

lane `lane-T1-1`（subagent `6894f9a6`，spawn / effort high）按契约交付；worker 复验后做两处收敛（删除重复等待文案、打开表单时隐藏该行入口），定向与相关测试复跑全绿，证据见 `evidence/`。
