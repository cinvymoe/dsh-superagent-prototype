# C3 评审与测试证据

- Run: `run-mwcyfvgt-1`（execute, policy A1），issue `q-7218cd2f:C3`
- Ticket: `1e2ca41e46a508c85f539bbb36406d00`
- 分支：`agent/worktree-1e2ca41e46a5`，基线 `5556291`（main）
- 评审日期：2026-11-12

## 变更范围

仅文档与文档测试：

| 文件 | 变更 |
| --- | --- |
| `docs/003-execution.md` | 目录根优先级 本地项目 `worktreeRoot` > `executor.directory` > `<stateDir>/work`（并注明面板标签 **Ticket directory root**）；显式根记录为 `execution.worktreeRoot`；prepare 以选定根目录为 cwd 且不自行选路径；显式根目录缺失/非目录/不可写时失败且不创建、不回退、修正后可重试；默认 `<stateDir>/work` 缺失时仍创建 |
| `docs/005-panel.md` | Discuss 项目字段（名称、执行仓库、可选绝对路径 `worktreeRoot`，空值为未配置）与 Sources/Execution 设置字段及根目录优先级/校验/prepare cwd 语义 |
| `docs/006-deployment.md` | Execution 设置步骤与 `executor` 配置键说明根目录解析、显式根目录校验与 prepare cwd，不再暗示 prepare 自行决定路径；补充根目录失败的排查行 |
| `docs/007-architecture.md` | `prepareDirectory` 说明补 prepare cwd；模块表（`core/model.ts`、`app/local.ts`、`executor/dsh.ts`、`sources/local-format.ts`、`client/discuss.tsx`）与测试表（`local.spec.ts`、`local-align.spec.ts`）相关行与实现一致 |
| `tests/docs.spec.ts` | 新增 `worktree root documentation` 测试组，断言上述文档语义 |

无 `src/**`、`prompts/**`、locale 或生成物变更。

## 双轴评审

执行说明：实现由 `feature_exec_dispatch` lane `lane-T1-1`（spawn）完成；评审由 worker 在完整读取 diff 与实现后自审（文档类改动、范围 5 个文件，按 worker 评审职责执行），结论如下。

### Standards 轴

结论：**通过（approve）**。

- 文档编号与链接规则未破坏：未新增或重排编号文档、未新增 Markdown 链接；`tests/docs.spec.ts` 的编号、链接、冲突标记检查全部通过。
- `docs/007-architecture.md` 模块表/测试表仍可被 `listed()` 解析；所有 `src` 文件与 `tests/*.spec.ts(x)` 均在表内且文件存在（`tests/docs.spec.ts` 通过）。
- 文风与既有文档一致：英文、短句、代码键用反引号、表行保持单行；`git diff --check` 无空白错误。
- 纯文档/文档测试，无公共 API、schema、安全或部署行为变更；无越界改动（`git diff --stat` 仅 5 个文件）。
- `tests/docs.spec.ts` 新增测试沿用既有 `describe/it/expect` 风格；`prose()` 只做空白归一化，断言直接对应冻结验收标准。

### Spec 轴（按冻结验收标准逐条）

| 验收标准 | 结论 | 证据 |
| --- | --- | --- |
| AC-1：`docs/003` 写出优先级、prepare cwd、显式根目录失败/不回退/修正后可重试 | PASS | `docs/003-execution.md` 第 25 行（优先级、`execution.worktreeRoot` 记录）、第 51 行（prepare 以选定根为 cwd、不自行选路径）、第 53 行（存在/目录/可写校验、失败不创建不回退、修正后 retry 或线程消息重跑）；`tests/docs.spec.ts` 对应断言通过 |
| AC-2：`docs/005` 的 Discuss 与 Execution 描述与面板实际字段一致 | PASS | `docs/005-panel.md` 第 20 行（项目 name/repository/可选绝对 `worktreeRoot`，空值未配置）、第 37 行（`worktreeRoot` 语义）、第 39 行（Execution 设置字段与优先级/校验/prepare cwd）；对照 `src/client/discuss.tsx`、`src/client/execution.tsx`、`src/client/locales.ts` 的 `executionDirectory`、`executionDirectoryHint`、`discuss.projectWorktreeRoot`、`discuss.projectWorktreeRootHint` |
| AC-3：`docs/006` 的 Execution 步骤与 executor 配置键覆盖语义，不再暗示 prepare 决定路径 | PASS | `docs/006-deployment.md` 第 149 行（优先级、prepare cwd、`$DSH_SUPERAGENT_DIR` 检出但不选根目录、显式根校验、失败不回退、修正后重试）、第 205 行（`executor.directory`/`prepare` 键说明）、排查表新增根目录失败行；对照 `src/executor/dsh.ts` `prepareDirectory`/`verifyWorktreeRoot` |
| AC-4：`docs/007` 模块表与实现一致；`tests/docs.spec.ts` 通过 | PASS | `docs/007-architecture.md` 第 201–203 行（`DshExecutor`/`prepareDirectory`/prepare cwd）、第 303/339/342/357/375/387 行附近模块行、第 415–416 行测试行；`pnpm vitest run tests/docs.spec.ts` 11 tests passed |

附加核对（实现与文档一致性）：

- `src/app/execution-environment.ts`：`resolvedExecutionRoot` 的优先级与 explicit 判定（`settings.executor.directory !== ''`）与 `docs/003`/`006`/`007` 一致。
- `src/executor/dsh.ts`：`ticketExecution` 仅在显式根时记录 `execution.worktreeRoot`；`verifyWorktreeRoot` 校验存在/目录/可写（写探针）；`prepareDirectory` 对 explicit root 不 `mkdir`、失败抛 `PrepareFailed` 且不自动重试（`launchQueued` 捕获后 `launchFailed`）；prepare 命令 cwd 为选定 root（`runAsWorker(..., ['sh','-c',command], root, ...)`）。
- `src/app/local.ts`：`createProject` 对相对路径返回 `projectWorktreeRoot` 错误、空字符串/缺省视为未配置；`docs/005` 的“空值未配置”一致。

评审未发现需要修改的 blocker 或 nit。已知的非阻塞表述重复：`docs/003` 第 55 行“A retry or a person's message … tries preparation again”与新第 53 行语义重叠，属既有句子，保留不改。

## 架构影响判定

- `arch_impact: local`。
- 仓库没有 `docs/architecture/` 与 `arch_impact.py`/`arch_check.py`（按现有 `docs/007-architecture.md` 为架构文档）；本 slice 已更新其模块表/测试表与 `DshExecutor` 说明，`tests/docs.spec.ts` 校验模块表完整性与文件存在性并通过。
- 无 `src` 结构变化，无新增模块；不需要 `changes/` 条目。

## 测试证据

- `pnpm vitest run tests/docs.spec.ts`：1 file / 11 tests passed（`docs/issues/evidence/docs-spec.log`）
- `pnpm typecheck`：通过，`tsc --noEmit` 无输出（`docs/issues/evidence/typecheck.log`）
- `pnpm build`（tsdown）：通过，Build complete（`docs/issues/evidence/build.log`）
- `git diff --check`：通过（`docs/issues/evidence/diff-check.log`）
- 变更 patch 与统计：`docs/issues/evidence/slice-C3.patch`、`docs/issues/evidence/diff-stat.log`
- 全量 `pnpm test`：1235 passed / 3 failed（60/62 files）。3 个失败均为本机环境问题且与文档无关，已用 `git stash` 在未改动的基线 `5556291` 上复跑同两个文件复现（`docs/issues/evidence/failing-baseline-stash.log`，结果同为 3 failed / 102 passed）：
  - `tests/environment.spec.ts`：本机 git 输出中文错误文本，断言匹配英文 `bad config`；
  - `tests/runtime.spec.ts` ×2：宿主 `GIT_CONFIG_GLOBAL` 已由部署设置为 `/root/.dsh/state/superagent-test/worker-gitconfig`，断言其为 undefined。
  - 带变更与基线的两次运行日志：`docs/issues/evidence/full-test.log`、`docs/issues/evidence/failing-baseline-files.log`、`docs/issues/evidence/failing-baseline-stash.log`。

## 尝试记录

- 实现 lane `lane-T1-1` 一次通过（文档 5 文件），无失败尝试。
- `tests/docs.spec.ts`、`typecheck`、`build` 均一次通过。