# Requirement snapshot — C3 retry

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

## Frozen acceptance criteria (C3)

1. `docs/003` 明确写出优先级 项目 worktreeRoot > `executor.directory` > `<stateDir>/work`，prepare 的 cwd 是选定根目录，显式根目录缺失/不可写时 Ticket 失败且不回退，修正后可重试。
2. `docs/005` 的 Discuss 与 Execution 描述与面板实际字段一致。
3. `docs/006` 的 Execution 步骤与 executor 配置键说明覆盖该语义，不再暗示 prepare 自行决定 worktree 路径。
4. `docs/007` 的模块表与测试表与实现一致；`tests/docs.spec.ts` 通过。

## Retry delta

C3 documentation had partially landed on deployment `main` via `f2f9ebe` and `4b2d3d0`（含 `tests/docs.spec.ts` 的 worktree 断言）。核对冻结标准后，仍有四类缺口：

- `docs/003` / `docs/006` 以 "chosen in this order: …, then …, then …" 叙述优先级，未给出标准要求的显式 `>` 链；
- `docs/005` 把空值写成 "unconfigured"，而面板提示是“留空沿用执行目录的根目录”，且 Execution 行没有把 **Ticket directory root** 与 `executor.directory`、留空默认 `<stateDir>/work` 对上；
- `docs/007` 的 `src/executor/dsh.ts` 模块行没有提 prepare 工作目录，`tests/docs.spec.ts` 测试行没有说明 worktree 根目录语义断言；
- `tests/docs.spec.ts` 的断言仍锁定旧措辞。

本 retry 只补这些文档与文档测试增量，生产实现来自已合入的 `2e79202`、`790f12f`、`f4421aa`。
