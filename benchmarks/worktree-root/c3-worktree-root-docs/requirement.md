# 需求快照：支持 worker 在指定目录创建 worktree（C3 文档 slice）

## 需求原文

> 目前 worker 的 worktree 由 executor.prepare 中的命令决定，实际路径写死在命令里，无法按项目或按执行环境配置。
>
> 希望做到：
> - 可以在项目或执行器配置中指定 worktree 根目录；worker 在该目录下为 Ticket 创建 worktree。
> - 没有配置时保持现状，不影响已有部署。
> - 本地 Discuss 项目可以使用自己配置的 worktree 目录。
> - 目录不存在或不可写时给出清楚的错误，Ticket 失败而不是静默落到错误路径。
> - 更新相关文档与测试。

## 对齐决定（文档口径）

1. 目录解析优先级：项目 `worktreeRoot` > `executor.directory` > `<stateDir>/work`；`executor.directory` 在面板上显示为 “Ticket directory root”。
2. worktree 的 git 检出仍由现有 `executor.prepare` 负责；本次只决定 prepare 的工作目录（选定根目录）与 `$DSH_SUPERAGENT_DIR`。
3. 显式配置的根目录（项目 `worktreeRoot` 或非空 `executor.directory`）在启动前严格校验存在、是目录且可写；失败时 Ticket 明确失败，不创建根目录、不回退默认路径、也不自动重试。修正根目录后，retry 或该工单线程上的人消息可重新准备并启动。
4. 已接受工单的 `execution.directory` 已落库；之后修改根目录设置只影响新工单。
5. 空字符串等价于未配置；项目创建时只校验 `worktreeRoot` 是绝对路径。

## 冻结验收标准（C3）

- `docs/003` 明确写出优先级 项目 worktreeRoot > `executor.directory` > `<stateDir>/work`，prepare 的 cwd 是选定根目录，显式根目录缺失/不可写时 Ticket 失败且不回退，修正后可重试。
- `docs/005` 的 Discuss 与 Execution 描述与面板实际字段一致。
- `docs/006` 的 Execution 步骤与 executor 配置键说明覆盖该语义，不再暗示 prepare 自行决定 worktree 路径。
- `docs/007` 的模块表与实现一致；`tests/docs.spec.ts` 通过。