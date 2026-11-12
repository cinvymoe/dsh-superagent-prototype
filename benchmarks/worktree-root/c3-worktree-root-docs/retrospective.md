# 复盘：C3 更新 worktree 根目录文档

## 结果

纯文档 slice 一次实现通过：5 个文件（4 篇编号文档 + `tests/docs.spec.ts`），无 `src/**` 变更；`tests/docs.spec.ts` 11/11、`typecheck`、`build` 通过。PR #6 已开在 operator fork `cinvymoe/dsh-superagent-prototype`，`mergeable: MERGEABLE`。

## 坑与修正

### 坑 1：ticket 基线与集成分支分叉，同一 C3 slice 的文档已存在于集成分支

- 怎么踩的：ticket 分支基于 `5556291`（本地 main），但部署 fork 的 `main`（`310ae2e`）已合并上一轮同一 slice 的 C3 文档提交 `4b2d3d0`；两者在 `docs/003-execution.md` 的同一段落都有修改，直接开 PR 会冲突。
- 怎么修的：`git log deployment/main` / `PR #4` 对账后，`git merge deployment/main`，在 `docs/003` 冲突处保留本分支版本（包含 `5556291` 新增的 execute-flow 句子），再把优先级改写为显式 `worktreeRoot > executor.directory > <stateDir>/work` 记法并同步 `docs.spec` 断言；PR 描述明确说明净变更。
- 下次：开 PR 前先查集成分支是否已合并同一 slice；若已存在，只提交差异 + ticket 记录，并在 PR 说明基线/净变更，不要把“基线分叉”当成实现失败。

### 坑 2：部署仓库拒绝 App push，PR 只能开在 operator fork

- 怎么踩的：`git push` 到 `deepseek-ai/dsh-superagent-prototype` 返回 403；`gh pr create --repo deepseek-ai/... --head cinvymoe:...` 返回 `Resource not accessible by integration`。
- 怎么修的：push 到可写的 operator fork `cinvymoe/dsh-superagent-prototype`，在 fork 上 `gh pr create --base main`（PR #6），并在 issue 与 PR 描述中记录限制；未启用 auto-merge。
- 下次：先探测可写远端；部署仓库不可写时直接走 operator fork，不重复尝试上游 PR。

### 坑 3：全量测试的 3 个失败来自宿主环境，与文档改动无关

- 怎么踩的：`pnpm test` 出现 3 failed（`tests/environment.spec.ts` 中文 git 报错、`tests/runtime.spec.ts` ×2 因宿主 `GIT_CONFIG_GLOBAL`）。
- 怎么修的：`git stash` 本 slice 改动后在同一 worktree 复跑同两个文件，结果同为 3 failed / 102 passed，确认基线复现；证据留在 `docs/issues/evidence/failing-baseline-stash.log`。
- 下次：全量测试出现与 diff 无关的失败，先用 stash/独立 worktree 在基线复跑归因，再决定是否处理。

### 坑 4：文档措辞必须能被测试断言，且逐句对应实现

- 怎么踩的：文档断言需要跨行匹配，直接写整段会受换行影响。
- 怎么修的：`tests/docs.spec.ts` 加 `prose()`（`\s+` 归一）后断言关键句；逐条对照 `resolvedExecutionRoot`、`verifyWorktreeRoot`、`prepareDirectory`、`createProject` 与面板 locale。
- 下次：文档类 slice 先定“实现事实清单”，再写句子与断言，避免文档/实现/断言三处漂移。

## 测试环境三问

1. 是否涉及真机 / GUI / 截图？否，纯文档与文档测试，无设备、无截图。
2. 截图 / 观测前是否做了旋转或方向转换？不适用。
3. 该前置是否在其他案例出现？不适用；本仓库无 UI 测试 skill 与设备基线。

## 证据回扫

- 实际执行过的手工前置：`pnpm install --offline --frozen-lockfile`（依赖安装）、`git stash`/`git stash pop`（基线复跑）。
- 命令与日志均在 `docs/issues/evidence/`；无截图旋转、设备连接、坐标换算等其他一次性前置。
- 测试环境升级判定：不涉及设备/截图，单案例留痕即可，无需升级共享模板。

## 架构复核

- 仓库无 `docs/architecture/` 与 `arch_check.py`；以 `docs/007-architecture.md` 为架构文档。本 slice 更新其模块表/测试表与 `DshExecutor` 说明，`tests/docs.spec.ts` 校验模块表完整性与文件存在性并通过。
- `arch_impact: local`；无 `src` 结构变化，无 `docs/architecture/changes/` 条目需要。