# Requirement snapshot · C2

## Original request (confirmed alignment `q-3603edff`)

> 当前的Issue都是以 PR 形式在远程仓库提交。最后执行，提交完成后。比如说我的插件是在本地运行的我需要本地的代码能够生效。所以说是否要在设置里面增加一个本地仓库的选项？或者讨论一下有没有什么更好的实现方式？能否在提示词或者流程里面新增加一个  本地合入并生效的流程。跟我讨论如何 方式实现。尽量满足高内聚低耦合。

Confirmed decision (see `local-issue:q-3603edff`): no new “local repository path” setting — the running checkout is discovered from the running plugin and the code repository from the existing chain. A deployment-level local-checkout capability covers the read-only facts (C1), the panel action (C3) and the end-to-end flow (C4), while **the service script is the only writer**: `prepare` merges and builds, `activate` merges, backs the database up and restarts, rolling back when the new build does not start. The last mile stays explicit: a dedicated profile uses `restart`/`activate`, a host profile is restarted by the operator.

## This slice (C2)

`scripts/dsh-superagent` gains two actions:

- `prepare --repository owner/name` — resolve the remote whose URL's last two path segments name the repository (case and `.git` insensitive; https, SSH and local-path forms), refuse a dirty worktree, a detached HEAD and any branch but `main`, fetch that remote's `main` into `refs/dsh-superagent/main`, refuse when local `main` has commits the remote does not have, fast-forward with `git merge --ff-only` (never a merge commit), then run `pnpm install --frozen-lockfile` and `pnpm build`. It prints `from`/`to` and prints `up to date` without building when nothing moved. A failed install or build returns the checkout to the previous commit and rebuilds it.
- `activate --repository owner/name [--if-idle] [--only-when-behind] [--respect-stop]` — read `setup.machine.stateDir` and `load.running` from `GET state`, stop the profile's service as `restart` does, copy the database (and `-wal`) into `.artifacts/backups/`, keep ten backups, start the service and wait for the same health check. A new build that does not become healthy is stopped, the checkout and database are restored to the pre-`prepare` state, the previous commit is rebuilt and started, the rollback is printed, and the action exits 1.

Out of scope: the panel and its API (C1/C3), any new configuration key or schema, restarting a host profile the script does not manage, automatic merges, and PR-merge bookkeeping.

## Frozen acceptance criteria

1. 临时真实 git 检出 + bare 远端领先时：prepare 只做 fast-forward 到新提交，桩 pnpm install/build 执行，不产生 merge commit，输出含 from/to；再次执行报告 up-to-date，不重启、不重复构建。
2. 脏树、分叉、detached、非 main、`--repository` 与检出 remote 不匹配 => 退出 1 且检出与服务均未变；并发第二个 prepare 被拒绝。
3. activate：从 `GET state` 读到 stateDir，停止后生成 orchestrator.sqlite 备份，启动并通过健康校验；`--if-idle` 在有执行中 Assignment 时跳过；`--respect-stop` 在手动停止时跳过；`--only-when-behind` 在已最新时跳过。
4. 注入启动失败：恢复到 prepare 前提交与备份库，重新安装/构建，旧版本启动成功并打印回滚，退出 1。
5. 现有 `tests/service-script.spec.ts` 全部通过；`pnpm check` 通过。
