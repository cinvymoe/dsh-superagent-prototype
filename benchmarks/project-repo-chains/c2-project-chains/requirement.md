# Requirement snapshot and frozen acceptance

## 需求原文（来源 trigger `ca586e78ff99c152e30518b3533b6bb9`）

> 1我当前项目superagent 修改 接收Issue的仓库 执行代码的仓库 ，rust_crane 也跟着修改了。 没有隔离。我的想法是 每个项目独立。
> 2旧版单链路 删除
>
> 仓库链路(一个 Issue 仓库 → 一个执行仓库)
> 接收Issue的仓库(旧版单链路) 2
> cinvymoe/dsh-superagent-prototype
> 执行代码的仓库(旧版单链路)
> cinvymoe/dsh-superagent-prototype

C1 已删除旧版单链路（GitHub Source 只保留显式 `chains`）。C2 承接第 1 点：每个本地项目拥有并隔离自己的仓库链路，执行按项目链路。

## 冻结验收标准

1. POST local/projects 传入 name、intakeRepository、codeRepository、可选 worktreeRoot 后，settings.sources.github.config.chains 只新增一条 id=项目 id 的链路，所有已有链路行逐字段不变；返回的项目视图包含两条仓库。
2. 仓库不可读/不可推送、名称重复、仓库格式非法时返回 400，且设置与项目记录都不留下失败产物。
3. PUT local/projects/:id 只更新该项目自身的链路与元数据；另一个项目的链路行在更新前后深度相等。
4. 项目工单的 execution.chain 等于项目链路的 id，DSH_SUPERAGENT_GITHUB_REPOSITORY 与 DSH_SUPERAGENT_GITHUB_INTAKE_REPOSITORY 等于该链路的 code/intake 仓库。
5. 已有只有 repository 的项目在启动时能幂等绑定到 code repository 相同的既有链路；无匹配的项目仍按原 repository 执行，且不改动其他链路。
6. pnpm check 全绿；docs/005 与 docs/007 描述项目拥有链路、旧记录回退与启动绑定。
