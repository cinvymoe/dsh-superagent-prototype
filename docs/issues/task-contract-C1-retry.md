# task-contract · C1 retry · 工单 worktree 根目录解析与启动校验

## 背景

- 对齐 issue：`q-94e6e32e`，slice `C1`；冻结验收标准见 `docs/issues/0b129da0e330dcbbb344fc21a2393ee2.md`。
- 仓库：`/root/.dsh/state/superagent-test/work/worktree-0b129da0e330`（分支 `agent/worktree-0b129da0e330`，基线 `5556291`）。
- C1 的核心实现已由前序工单合入基线（`2e79202 feat: support per-project worktree roots`），包含：
  - `src/app/execution-environment.ts` `resolvedExecutionRoot`（项目 `worktreeRoot` > `executor.directory` > `<stateDir>/work`）；
  - `src/app/runtime.ts` 按来源 Trigger 的 `meta.project` 解析项目并注入 `ExecutorHost.worktreeRoot`；
  - `src/executor/dsh.ts` `ticketExecution` 落库 `Execution.worktreeRoot`，`verifyWorktreeRoot` 校验存在/目录/可写（`access` + `mkdtemp` 写探测），`prepareDirectory` 以选定根目录为 prepare cwd，`PrepareFailed` 不自动重试；
  - `tests/local-align.spec.ts` 的 `project worktree roots` 分组覆盖失败、retry、人消息恢复、目录稳定性、Feishu 不回归。
- 本次 retry 的冻结标准有一处语义更新：`createProject` 的**纯空白值等价于未配置**；基线实现与旧测试把它当错误。

## 目标（唯一代码增量）

修改 `src/app/local.ts` 的 `createProject`：

- `worktreeRoot === undefined`、`''`、或 `trim()` 后为空 → 视为未配置，存储记录不落 `worktreeRoot` 字段；
- 非空值 `trim()` 后必须是绝对路径，否则抛 `UserError('projectWorktreeRoot')`（消息不变：`A project worktree root must be an absolute path`）；
- 合法值保存 trim 后的绝对路径；
- 存在性与写权限仍不在创建时校验。

并同步测试：

1. `tests/local.spec.ts` 的 worktree root 用例：把“仅空白值报错”改为“纯空白等价于未配置（不落字段、不抛错）”；相对路径仍断言 `code === 'projectWorktreeRoot'`；保留 trim 合法值、`undefined`/`''` 的既有断言。
2. `tests/local-align.spec.ts`：在 HTTP 项目创建用例中补充纯空白 `worktreeRoot`（如 `'   '`）返回 200 且响应无 `worktreeRoot` 字段（HTTP schema 已 trim；此测试锁定端到端语义）。不删除或削弱现有 C1 用例。

## 不可做

- 不修改产品文档（`docs/003`/`005`/`006`/`007`）、Discuss 表单/客户端文案、HTTP 路由 schema（C2/C3 范围）。
- 不引入依赖；不改动其他模块。
- 不 commit、不 push、不建 PR；不改 `docs/issues/` 下文件（评审与交付由执行 run 负责）。
- 若发现冻结标准自相矛盾或必须跨出 C1 范围，停止并报告，不自行扩张。

## 验证命令

- `pnpm typecheck`
- `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/runtime-concurrency.spec.ts tests/locales.spec.ts`
- `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm test`（全量；记录既有环境敏感失败与基线对比）

先写/改失败测试再改实现（红→绿），保留实际命令输出摘要。

## 回报格式

1. 改动文件与关键 diff。
2. 红→绿证据（改动测试在修复前失败、修复后通过）。
3. 上述三条验证命令的实际结果（通过/失败数；失败项是否基线同败）。
4. 未完成项或限制。