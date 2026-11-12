# Requirement snapshot — C1 retry

## Original request (Discuss issue `q-94e6e32e`)

> Worktree root execution retry
>
> 支持 worker 在指定目录创建 worktree。项目可配置 worktree 根目录；未配置保持现状；目录不可用明确失败；更新文档测试。重试运行，验证 feature-exec dispatch 修复。

Underlying requirement recorded in the alignment:

> 目前 worker 的 worktree 由 executor.prepare 中的命令决定，实际路径写死在命令里，无法按项目或按执行环境配置。
>
> 希望做到：
> - 可以在项目或执行器配置中指定 worktree 根目录；worker 在该目录下为 Ticket 创建 worktree。
> - 没有配置时保持现状，不影响已有部署。
> - 本地 Discuss 项目可以使用自己配置的 worktree 目录。
> - 目录不存在或不可写时给出清楚的错误，Ticket 失败而不是静默落到错误路径。
> - 更新相关文档与测试。

## Frozen acceptance criteria (C1)

- `pnpm typecheck` 与相关 vitest 通过；未配置 `worktreeRoot` 的现有用例和部署行为不变。
- 项目 `worktreeRoot=/tmp/root` 时，本地工单 `execution.directory` 为 `/tmp/root/<工单短名>`；prepare 的 cwd 为 `/tmp/root`；prepare 环境中 `DSH_SUPERAGENT_DIR` 指向该工单目录，`DSH_SUPERAGENT_GITHUB_REPOSITORY` 仍为项目仓库。
- 项目未配置 `worktreeRoot` 时，本地工单仍用 `executor.directory`（非空时）或 `<stateDir>/work`；GitHub/Feishu 工单目录不因项目字段改变。
- 显式根目录不存在、是普通文件或不可写时，不启动 worker Session；最新 Assignment 报 `failed`，summary 含该绝对路径及失败原因；该路径没有被创建，默认根下也没有该工单目录。
- 这类失败不被自动重试；修正根目录后，retry 或该工单线程上的人消息能重新准备并启动。
- 已接受工单的 `execution.directory` 不因之后修改根目录设置而改变。
- `createProject` 对相对路径给出明确错误；省略、空字符串和纯空白等价于未配置。

## Retry delta

C1 core landed in `2e79202`. The retry alignment changed the last clause: whitespace-only used to raise `projectWorktreeRoot`; it must now equal unconfigured. This case records that delta and the inherited coverage that must keep passing.
