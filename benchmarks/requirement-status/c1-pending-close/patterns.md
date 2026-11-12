# 可复用模式

## 成功模式

1. **派生状态放视图，不进记录**：状态由读取时的领域事实（切片工单的 `ended`）计算，用 `XxxView = XxxRecord & { derived }` 暴露；不写 KV、不迁移，工单恢复时派生值自动回退。适用于任何「记录 + 实时状态」的展示。
2. **写端与读端共用 id 规则**：把 `key('ticket','plan',issueId,sliceId)` 提为 `planTicketId()`，派发与视图共用一处；否则两处规则漂移会让「派生值永远 false」这类 bug 静默存在。
3. **列表与详情共用同一标签函数**：`stateTag` 只写一次，列表行与详情页头都用它；状态优先级（closed > pending close > open）集中在一处，避免两处显示不一致。
4. **两个隔离面板 + 同一份种子做 Before/After**：两个 DSH profile 分别 link 基线与分支 checkout，stateDir 各自独立，用同一 `seed.mjs`（schema 11）写相同 SQLite 行；Chromium headless 1440×1100、浅色、zh-CN、同一 `sessionStorage` 路由。UI 改动的 PR 证据可完全复现，且不碰部署实例/真实凭据。
5. **基线漂移后刷新证据而不是将就**：main 前进后先合并、跑合并树上的 `pnpm check`，再把 Before 重建到新 main、After 用合并后 head；PR 描述里的版本号必须与实际 head 对齐。
6. **owner 提前合并时的收尾路径**：PR 已合并时不要重开或改写分支；把评审记录、回归案例与 issue 沉淀做成基于新 main 的 docs-only follow-up PR，保持原 PR 的合并事实不变。

## 踩坑模式

1. **需求列表默认过滤会隐藏取证目标**：main 起默认「待处理」只显示无对齐/待审阅/已打回的需求，已确认需求不在默认视图里；截图前两个实例都要切「全部」，否则同场景前提不成立。
2. **并行 PR 合并让基线过期**：PR 开着时 main 会前进（本例 40191e32 → 934a1f07），`mergeable` 变 CONFLICTING；尽早 fetch/merge 并重跑合并树检查，别等评审结束才发现。
3. **feature-exec 机器门在本部署读不到 issue facts**：`feature_exec_status` 的 `review.md` / `frontmatter.arch_impact` 检查在 facts 为空时永远 fail（常驻进程 cwd 为 `/`）；用带证据的 `by: agent` 门记录，并把限制写进 issue，不要为了点亮 checklist 造假文件。
4. **重启/停止会打断 lane**：宿主重启会停掉正在跑的 review lane（无结尾消息）。恢复时先核对 worktree/git/PR 状态，再决定续跑还是换新 lane；已完成的 push/merge/PR 不要重复。
5. **子集测试的「81 passed」在合并后会变**：合并 main 后刷新了 `-targeted.log`（88 tests），PR 描述里旧的 81 数字会与证据不符；改描述时同步核对日志里的数字。
