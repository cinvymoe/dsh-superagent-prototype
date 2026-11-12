# Requirement snapshot — C2 retry

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

## Frozen acceptance criteria (C2)

1. `POST local/projects` 带 `worktreeRoot=/srv/wt` 时返回并持久化；省略或空字符串表示未配置；相对路径返回 400 并说明必须是绝对路径。
2. `GET local/projects` 与 `GET local/issues/:id` 返回该字段；没有该字段的旧记录响应仍合法。
3. Discuss 表单可填写并提交 `worktreeRoot`，留空不提交该字段；创建后项目行显示该路径；中英文文案齐全。
4. Execution 设置中根目录提示包含“显式配置时必须已存在且可写”的说明。
5. jsdom 面板测试覆盖提交 payload 与展示；HTTP 路由测试覆盖合法/非法路径；相关 vitest 与 `pnpm check` 通过。
6. UI 变更的 PR 描述包含同场景、同视口、同主题的 Before（main 基线）与 After（本分支）截图，并标明版本。

## Retry delta

C2 production behavior landed in `f4421aa` (PR #3) and is present on deployment `main` `310ae2e`. The retry alignment clarified that omitted, empty-string and whitespace-only project roots are all unconfigured (frozen decision 4). This case records the boundary regression coverage added on top of the merged base and keeps the inherited C2 behavior passing.
