# 试错台账

| 轮次 | 动作与假设 | 预期 | 实际失败信号 | 失败原因分类 | 有效修正 |
| --- | --- | --- | --- | --- | --- |
| 1 | 先写服务端与面板断言，跑目标 vitest | 新断言全红，证明测试有效 | 3 failed / 78 passed（`evidence/red.log`） | 正常 TDD 红跑 | 无；继续实现 |
| 2 | 实现 `planTicketId` / `LocalIssueView` / `view()` / 8 条路由 / `stateTag` 后跑目标测试 | 全绿 | 6 files / 81 passed，typecheck 与 build 通过 | 一次通过（实现侧） | 提交 PR #27（head `c4c2d99f`） |
| 3 | PR 基线 `40191e32`，等待评审 | PR 保持 MERGEABLE | deployment main 前进到 `934a1f07`（合入 #19/#22/#23/#24/#25/#26），PR 变 `CONFLICTING` | 外部基线漂移（并行 PR 合并） | `git fetch` main → `git merge FETCH_HEAD`；手工解 `docs/005-panel.md`、`src/client/discuss.tsx`、`tests/fixtures/panel-server.ts` 三处冲突，其余自动合并后人工复核；合并树重跑 `pnpm check` 全绿 |
| 4 | 沿用旧 Before/After 截图 | 截图仍匹配新基线 | 旧 Before 是 `40191e32`，已不是 PR 的 merge target；且 main 新增的过滤行默认「待处理」会隐藏已确认需求 | 由于 (3) 的基线漂移；截图同场景前提被破坏 | Before 重建 `934a1f07` 面板、After 用合并后 head；两个实例都点「全部」后再截；标签序列写进 capture 日志 |
| 5 | 宿主在 e3 期间连续重启两次 | 评审 lane 正常回报 | 工作停在 e3；Standards 评审 lane 被停且无结尾消息；PR 实际已被 owner 合并 | 宿主重启（外部事件），不是代码问题 | 每轮恢复先核对 worktree/git/PR（不重复已完成的 push/merge 外部操作）；Spec 评审已 `approve`；Standards 评审换新 lane 重试 |
| 6 | 计划 e3 双轴评审通过后再进 e4/e5 | 评审与沉淀在同一 PR 内 | owner 在评审完成前把 PR #27 合并（merge commit `422a21a4`） | 人的合并时序早于流程收尾 | 保持原 PR 已合并事实；把评审记录、回归案例与 issue 沉淀改为 docs-only follow-up PR（基于新 main），不重开、不改写已合并分支 |
| 7 | 依赖 feature_exec 机器门自动判定 `review.md` / `arch_impact` | 状态页显示门通过 | `feature_exec_status` 的 machine gate 报「缺少 review.md / frontmatter.arch_impact 未判定」，但仓库里两者都存在 | 本部署的 issue facts carrier 未取到 issue 路径（常驻进程 cwd 为 `/`，facts 为空），机器门 checklist 永远读不到 | 不伪造文件：以 `feature_exec_gate` 的 `by: agent` + 明确 evidence 记录门，并在 issue 写清 carrier 限制；这是部署环境坑，不是本 slice 代码问题 |

一次成功项：实现 lane 的 `pnpm typecheck`、`pnpm build`、合并后 `pnpm check`（64 文件 / 1324 测试）均一次通过；不重复沉淀。
