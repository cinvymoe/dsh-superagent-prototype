# Requirement snapshot · C3

## Original request (confirmed alignment `q-3603edff`)

> 当前的Issue都是以 PR 形式在远程仓库提交。最后执行，提交完成后。比如说我的插件是在本地运行的我需要本地的代码能够生效。所以说是否要在设置里面增加一个本地仓库的选项？或者讨论一下有没有什么更好的实现方式？能否在提示词或者流程里面新增加一个  本地合入并生效的流程。跟我讨论如何 方式实现。尽量满足高内聚低耦合。

Confirmed decision: no new “local repository path” setting; the running checkout is discovered from the plugin (`packageRoot()`), the target repository from the existing chain. The service script is the only writer; the panel asks it. C1 = read-only facts, C2 = script `prepare`/`activate`, C3 = the panel action, C4 = the operator flow documentation.

## This slice (C3)

- `GET deployment/checkout` gains the HEAD commit time and every remote, so a chain match can use a `deployment` remote when `origin` is the upstream.
- `src/app/prepare.ts` (`Prepare`): chain match across all remotes, `noChain`/`empty`, single-flight `merge()` that spawns `scripts/dsh-superagent prepare --repository <repo>` and keeps its output.
- `GET/POST deployment/prepare`; Deployment page section with facts, disabled reasons, setup waiting, confirmation, new HEAD + 「重启后生效」, persistent failure with script tail and log path.
- No restart/exit signal from the route; unavailable/concurrent => 400.

## Frozen acceptance criteria

1. 页面显示路径、分支、短 HEAD+时间、脏状态、匹配链仓库；不可用时按钮禁用并显示原因；setup 未完成时显示等待。
2. 确认后 POST 成功 => 刷新为新的 HEAD 并显示「重启后生效」；失败 => 保留页面，展示脚本拒绝/失败信息与日志路径；重复点击只执行一次。
3. 该路由不发送任何重启/退出信号（测试断言），不可用或并发时返回 400，且服务继续运行。
4. 中英文案齐全；`tests/panel-deployment.spec.tsx` 与 `tests/http.spec.ts` 覆盖；`pnpm check` 通过。
5. PR 附 before/after 实际运行截图，标注基线与改动提交，不暴露密钥或私人内容。
