# Requirement snapshot · C4

## Original request (confirmed alignment `q-3603edff`)

> 当前的Issue都是以 PR 形式在远程仓库提交。最后执行，提交完成后。比如说我的插件是在本地运行的我需要本地的代码能够生效。所以说是否要在设置里面增加一个本地仓库的选项？或者讨论一下有没有什么更好的实现方式？能否在提示词或者流程里面新增加一个  本地合入并生效的流程。跟我讨论如何 方式实现。尽量满足高内聚低耦合。

Confirmed decision: no new “local repository path” setting; the running checkout is discovered from the plugin, the repository from the existing chain, the service script is the only writer, and the last mile (restart) is explicit. C1 = read-only facts, C2 = script `prepare`/`activate`, C3 = the panel action, C4 = the operator flow documentation.

## This slice (C4)

- `docs/006-deployment.md`: the four-step flow from a merged pull request to a running version that matches the disk, the two deployment forms and their restarts, the exit codes of `prepare`/`activate`/`restart`, a second hourly-check prompt that activates while idle, verification through `GET deployment/checkout`, and troubleshooting rows.
- `docs/005-panel.md`: the Deployment page's **Running checkout** block and **Pull and build** action.
- `docs/007-architecture.md`: rebuilt code, unlike configuration, needs the loading process to restart; link to 006.
- `tests/docs.spec.ts`: assertions that pin the flow.

## Frozen acceptance criteria

1. 文档给出从「PR 已合并」到「运行版本 = 磁盘版本」的完整步骤与预期输出，命令参数和退出码与实现一致。
2. 明确两种部署形态各自的重启步骤，并明确插件不会自动重启宿主。
3. 小时检查段落给出可直接使用的提示词，并说明只在动作/失败时汇报。
4. `tests/docs.spec.ts` 通过，文中无失效链接或未实现的命令。
