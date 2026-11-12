# task-contract C3 · 更新 worktree 根目录文档

- Run: `run-mwcyfvgt-1`（execute, policy A1）
- Issue: `q-7218cd2f:C3`
- Ticket: `1e2ca41e46a508c85f539bbb36406d00`
- Worktree (cwd): `/root/.dsh/state/superagent-test/work/worktree-1e2ca41e46a5`
- Baseline: `5556291`（本地 main）
- 依赖：C1/C2 的实现已在该基线中（`src/app/execution-environment.ts`、`src/executor/dsh.ts`、`src/app/local.ts`、`src/client/discuss.tsx`、`src/client/execution.tsx`）

## 目标

只改文档与文档测试，使实现语义与冻结验收标准一致：

- `docs/003-execution.md`：目录根优先级（本地项目 `worktreeRoot` > `executor.directory` > `<stateDir>/work`）、显式根记录为 `execution.worktreeRoot`、prepare 以选定根目录为 cwd 且不自行选路径、显式根目录缺失/非目录/不可写时失败且不创建、不回退、修正后重试；默认 `<stateDir>/work` 缺失时仍创建。
- `docs/005-panel.md`：Discuss 与 Execution 描述与面板实际字段一致（项目名、执行仓库、可选绝对路径 worktree root；Execution 的 Ticket directory root / prepare command / blocked commands 及根目录优先级）。
- `docs/006-deployment.md`：Execution 设置步骤与 `executor` 配置键说明覆盖同一语义，不再暗示 prepare 自行决定 worktree 路径；补根目录失败的排查行。
- `docs/007-architecture.md`：`DshExecutor`/`prepareDirectory` 说明与模块表、测试表中与本特性相关的行与实现一致。
- `tests/docs.spec.ts`：新增 `worktree root documentation` 测试组，断言上述语义。

## 参考

- 实现：`src/app/execution-environment.ts` 的 `resolvedExecutionRoot`；`src/executor/dsh.ts` 的 `ticketExecution`、`verifyWorktreeRoot`、`prepareDirectory`；`src/app/local.ts` 的 `createProject`；`src/client/discuss.tsx`；`src/client/execution.tsx`；`src/client/locales.ts` 的 `executionDirectoryHint`、`discuss.projectWorktreeRootHint`。
- 上一轮同一 slice 的已合入文档（可参考措辞，但要适配当前基线，保留 `docs/003` 第 25 行末尾关于 execute flow 的句子）：`git show 4b2d3d0 -- docs/003-execution.md docs/005-panel.md docs/006-deployment.md docs/007-architecture.md tests/docs.spec.ts`。
- 注意：`4b2d3d0` 基于 `c476d80`，当前基线 `5556291` 在该处多了一句 “A Ticket created from a confirmed alignment slice starts the feature-exec `execute` flow, which ends at an open PR; review and merge stay with a person.”，改写时必须保留。

## 验收

- `pnpm vitest run tests/docs.spec.ts` 通过。
- `pnpm typecheck` 通过。
- `git diff --check` 无空白错误。
- 只改上述 5 个文件；不改 `src/**`、`prompts/**`、locale、生成物。

## 报告格式

汇报：改动文件与要点、实际运行的命令与结果、发现的偏差/风险、未完成项。不要提交 commit（worker 负责提交）。