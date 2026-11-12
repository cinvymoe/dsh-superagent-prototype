# 任务契约 · C3 实施 lane（T1）

## 目标

在既有 `agents` 设置块与工具目录之上，交付面板「智能体」设置组：三张角色卡片、模型继承与覆盖、必需/可选工具、执行器并发链接、草稿/冲突/历史、双语文案与文档。不改设置块 schema、校验、HTTP 路由或运行期行为。

## 允许改动

- 新增：`src/client/agents.tsx`、`src/agent-model.ts`、`tests/panel-agents.spec.tsx`
- 修改：`src/client/settings.tsx`、`src/client/route.ts`、`src/client/locales.ts`、`src/app/role-models.ts`、`tests/fixtures/panel-server.ts`、`tests/panel-settings.spec.tsx`、`docs/005-panel.md`、`docs/007-architecture.md`
- 测试需要时可动共享控件（`src/client/controls.tsx` 只加可选属性），不得改 `src/app/agent-tools.ts`、`src/app/settings.ts`、`src/policy.ts`、`src/app/http.ts`、prompts 或运行期路径
- 不碰 `docs/issues/` 与截图工具；证据写 `docs/issues/evidence/C3-agents-*.log`

## 关键约束

1. 继承口径只有一份实现：`roleModel` 移到浏览器安全的纯模块（仅 `import type`），`src/app/role-models.ts` 重导出；面板用「清掉当前角色覆盖」后的 settings 调用它。
2. 复用 `useBlockDraft` + `SaveBar` + `Fields` + `ConfigHistory`，不自造草稿/冲突状态。
3. 必需工具用原生 `disabled` 开关（不是点击后忽略）；`disabledTools` 保存时按目录 optional 顺序过滤。
4. 执行器卡片从 `GET state` 的 `load` 读 `running / maxWorkers`，只链接到执行组，不放置 `maxWorkers` 输入。
5. 文案中英成对；`tests/locales.spec.ts` 的占位符/缺失校验必须通过。
6. `docs/007` 的 Modules/Tests 表要在同一提交里补全，否则 `tests/docs.spec.ts` 失败。

## 验证命令

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C \
  pnpm vitest run tests/panel-agents.spec.tsx tests/panel-settings.spec.tsx tests/locales.spec.ts tests/docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
grep -c 'node:' lib/client.js   # 必须为 0
```

## 报告格式

改动文件逐行说明；每条命令的 pass/fail 与用例数；逐条验收覆盖情况与偏差原因；页面实际渲染内容（角色卡、继承行、工具区、执行器链接）供复核。
