# 试错台账：C3 文档 slice

| 轮次 | 动作与假设 | 预期 | 实际失败信号 | 失败原因分类 | 有效修正 |
| --- | --- | --- | --- | --- | --- |
| 1 | `feature_exec_start(execute)` → e1 写 issue → e2 派 `lane-T1-1`（spawn，T1）实施文档 5 文件 | lane 一次完成并自测 | 无失败，lane 一次通过（5 文件 +53/−16，docs.spec 11/11、typecheck、diff --check） | —（一次成功） | — |
| 2 | 全量 `pnpm test` | 全部通过 | 3 failed（environment 1、runtime 2） | 宿主环境：git 中文本地化、`GIT_CONFIG_GLOBAL` 已设置 | `git stash` 后在基线 `5556291` 复跑同两个文件，结果同为 3 failed / 102 passed，归因为环境噪声 |
| 3 | `git push` 到 `deepseek-ai/dsh-superagent-prototype`（部署仓库） | 分支推送成功 | HTTP 403（Permission denied to rust-crane-agent[bot]） | 权限：App 对部署仓库无写权限 | push 到可写的 operator fork `cinvymoe/dsh-superagent-prototype` |
| 4 | `gh pr create --repo deepseek-ai/... --head cinvymoe:...` | 在部署仓库开 PR | GraphQL `Resource not accessible by integration`（createPullRequest） | 权限：跨仓库 PR 无权限 | 在 operator fork `cinvymoe/dsh-superagent-prototype` 上用 `gh pr create --base main` 开 PR #6 |
| 5 | 直接以本分支（基于 `5556291`）向 fork `main`（`310ae2e`）开 PR | 干净 diff | `git merge-tree` 显示 `docs/003-execution.md` 冲突（fork main 已含上一轮 C3 `4b2d3d0`） | 基线分叉：amended main 多一句 execute-flow 句子 | `git merge deployment/main`，解决冲突保留本分支版本 + 显式 `>` 优先级记法，更新 docs.spec 断言；PR #6 `mergeable: MERGEABLE` |

## 结论

- 真正影响交付的尝试是第 3–5 轮（权限与基线分叉），均一次改道解决；第 1–2 轮为一次通过/环境噪声。
- 下次从第几步开始能一次做对：先探测“部署仓库是否可 push + 集成分支是否已有同 slice”，再决定 push 目标与是否需要 merge 对账。
- 出现什么信号应立即停手换路径：push 返回 403 → 直接走 operator fork；`git merge-tree` 报同文件冲突且对方已有同 slice → 先对账，不重复实现。
