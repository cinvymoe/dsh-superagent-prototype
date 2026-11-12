# 任务契约：C3 文档 slice

- 目标：只改 `docs/003-execution.md`、`docs/005-panel.md`、`docs/006-deployment.md`、`docs/007-architecture.md`、`tests/docs.spec.ts`，让 worktree 根目录文档与实现及冻结验收标准一致。
- 实现事实来源：`src/app/execution-environment.ts`（`resolvedExecutionRoot`）、`src/executor/dsh.ts`（`ticketExecution`/`verifyWorktreeRoot`/`prepareDirectory`）、`src/app/local.ts`（`createProject`）、`src/client/discuss.tsx`/`execution.tsx`/`locales.ts`。
- 关键语义：
  - 优先级：项目 `worktreeRoot` > `executor.directory` > `<stateDir>/work`；显式根记录为 `execution.worktreeRoot`。
  - `executor.prepare` 以选定根目录为 cwd；命令只负责把仓库检出到 `$DSH_SUPERAGENT_DIR`，不决定根目录。
  - 显式根目录缺失/非目录/不可写：Ticket 失败（含绝对路径与原因），不创建、不回退、不自动重试；修正后 retry 或线程消息可重试。
  - 默认 `<stateDir>/work` 缺失时仍创建。
- 验证：`pnpm vitest run tests/docs.spec.ts`、`pnpm typecheck`、`git diff --check`。
- 约束：不改 `src/**`、`prompts/**`、locale、生成物；由 worker 提交 commit，lane 不提交。

完整版见 ticket 工作区 `docs/issues/task-contract-C3.md`。