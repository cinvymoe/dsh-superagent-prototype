# C1 双轴评审与验收证据 · 需求列表在全部切片工单结束后显示「待关闭」

- Run: `run-mwdqkwle-9`（execute，policy A1），issue `q-e421cac7:C1`
- Ticket: `687169eff8075350b6a3bf8bf754f7e2`
- 分支：`agent/slice-687169eff807`；实现基线 `40191e32`，评审基线 `934a1f07`，head `6c91a4f7`
- PR：https://github.com/cinvymoe/dsh-superagent-prototype/pull/27 （已由 owner `cinvymoe` 合并，merge commit `422a21a4`；未启用 auto-merge）
- 评审日期：2026-11-13
- 评审 lane（独立上下文，主会话未代评）：Standards `lane-R1-4`（T2/high；首次 `lane-R1-2` 被宿主重启停止，重试）、Spec `lane-R2-3`（T2/high）

## 变更范围（PR #27，`git diff 934a1f07..6c91a4f7`）

9 个生产文件、3 个测试文件、2 份文档，另加切片记录、证据与截图；无新模块、无 schema、无迁移。

| 文件 | 变更 |
| --- | --- |
| `src/core/ids.ts` / `src/core/index.ts` | 新增并导出 `planTicketId(issueId, sliceId)`，切片工单 id 的唯一来源 |
| `src/core/evals.ts` | `acceptPlan` 的 ticket id 与 `dependsOn` 改用 `planTicketId`，值逐字节不变 |
| `src/sources/local-format.ts` | 新增仅视图类型 `LocalIssueView = LocalIssue & { slicesFinished }` |
| `src/app/local.ts` | 新增 `view(issue)`：confirmed + 切片非空 + 每片工单存在且 ended；零切片/缺工单 false；只读 |
| `src/app/http.ts` / `src/app/api.ts` | 8 条返回 requirement 的 local 路由统一返回视图，响应类型同步 |
| `src/client/discuss.tsx` | `stateTag`：closed→已关闭、open+slicesFinished→待关闭（info）、否则开放；对齐标签不变 |
| `src/client/locales.ts` | `discuss.pendingClose: ['待关闭', 'Pending close']` |
| `tests/local-align.spec.ts` | 真实派发 → 两种结束方式 → 派生值翻转；存储记录无字段；零切片/缺工单/proposed/rejected/无对齐 false |
| `tests/fixtures/panel-server.ts` | 保留 main 的评论/metrics 扩展，新增 `issueSlicesFinished` + `issueView()`，所有 requirement 路由走视图 |
| `tests/panel-discuss.spec.tsx` | 列表行与详情页头：待关闭/开放/已关闭 + 已确认共存；main 默认过滤下用 `filter: 'all'` |
| `docs/005-panel.md` / `docs/007-architecture.md` | 需求三态说明与 `Requirement states` 段；ids/local/http/local-format 模块行 |

## Standards 轴（lane-R1-4）

结论：**approve**，无 must-fix。核验通过：core 无 I/O 且只 import 自身与 `node:crypto`；sources 不 import app；面板只从 host 侧取类型（`LocalIssueView` 为 type-only）；`planTicketId` 是唯一 id 派生点（`grep -rn "ticket', 'plan" src` 仅 `src/core/ids.ts:12`，测试里的 raw key 断言是刻意的 bytes-unchanged guard）；8 条路由全部包 `view()` 且 `Routes` 类型能挡住漏包；测试为行为断言、fixture 只有一处派生；文档与代码一致；无冲突标记、无凭据泄漏、提交作者与 trailer 正确。

Findings 与处置：

| # | 严重度 | 内容 | 处置 |
| --- | --- | --- | --- |
| 1 | should-fix | `docs/007-architecture.md` 的 Tests 表行未记录新增覆盖，`discuss.tsx` 模块行未提状态标签 | 已在本 follow-up PR 修正（local-align / panel-discuss / discuss.tsx 三行） |
| 2 | nit | issue 文档一处写「6 个返回 issue 的 local 路由」，实际 8 | 已修正为 8 |
| 3 | nit | `src/client/discuss.tsx` 唯一一条中文注释，与仓库注释语言不一致 | 已改为英文注释（行为不变） |
| 4 | nit | 证据日志 4 行行尾空白（tsdown 输出继承），`git diff --check` 报警 | 已仅删除这 4 行的行尾空白，日志内容不变 |
| 5 | nit | POST comments / POST execution 两条路由的视图响应无行为断言（类型已挡） | 已在 `tests/local-align.spec.ts` 补两条断言 |
| 6 | nit | `docs/005-panel.md` 新语义无 `tests/docs.spec.ts` 守卫 | 已新增 describe 守卫 005 句子与 007 行 |
| 7 | info | 005 里顺带修正了 main 的句末标点/大小写 | 保留，PR 记录注明 |

## Spec 轴（lane-R2-3）

结论：**approve**，7 条冻结验收逐条通过。证据：

| AC | 结论 | 证据 |
| --- | --- | --- |
| 1 未结束 → false、仍「开放」 | pass | `src/app/local.ts` 的 `view()`（任一工单缺 `ended` 即 false）；`tests/local-align.spec.ts` 确认后/派发后两个 GET 均 false；`tests/panel-discuss.spec.tsx` live 行「开放 + 已确认」 |
| 2 全部 ended → true、「待关闭」、两种结束方式 | pass | `local-align.spec.ts`：`engine.report({state:'ready'})`（executor）仍 false，`engine.stopTicket`（human/stopped）后 list+detail true；面板用例：待关闭 + 已确认，无 开放 |
| 3 关闭只显示已关闭；无对齐/待审阅/已打回仍开放；零切片/缺工单不误报 | pass | `local-align.spec.ts` 异常数据直写：zero slices / missing ticket / proposed / rejected / unaligned 全 false；面板用例 closed 即使派生值 true 也只显示 已关闭；`stateTag` 先判 closed |
| 4 仅 HTTP 视图、无持久化/迁移 | pass | `git grep slicesFinished` 只在视图类型/计算/客户端/测试/文档；`view()` 只读 tickets；测试断言 `runtime.local.get()/list()` 无该字段；无 KV/schema diff |
| 5 `pnpm check` + 双语 locale | pass | 全净 `pnpm check` = typecheck + 64 files / 1324 tests + build，exit 0（`-check.log`、`-merge-check.log`）；`tests/locales.spec.ts` en/zh 对齐、无占位符差异 |
| 6 文档与 docs/class-docs 测试 | pass | 005 三态句 + `Requirement states` 段；007 模块行；`tests/docs.spec.ts`（16）+ `tests/class-docs.spec.ts`（1）通过 |
| 7 PR 同场景 1440×1100 浅色 zh-CN Before/After | pass | PR 描述 Before=`934a1f07`、After=`6c91a4f7`；四图 `identify` = 1440x1100；实看：Before finished 行 开放/已确认，After 待关闭/已确认，live/closed/unaligned 行两侧一致；capture 日志记录过滤「全部」与 token 不落盘 |

## 测试证据（实际执行）

- 目标子集：`pnpm vitest run tests/local-align.spec.ts tests/panel-discuss.spec.tsx tests/navigation.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts` → 6 files / 88 tests passed。
- 红跑：同子集在实现前 3 failed / 78 passed（`docs/issues/evidence/c1-pending-close-red.log`）。
- 门禁：`env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check` → typecheck + 64 files / 1324 tests + build，exit 0。
- 合并树：`git diff --check`（follow-up PR 内已清理继承的 4 行行尾空白）。

## 架构影响

`local`。core 新增纯函数、sources 新增视图类型、app 新增只读派生并在既有 local 路由返回、面板只改标签函数与一个双语键；无新模块、无 schema/迁移、无跨产品公共 API 变更；`docs/005-panel.md`、`docs/007-architecture.md` 已同步。仓库没有 feature-exec 的 arch-doc 脚本/ADR 库，架构文档即 `docs/007`，由 `tests/docs.spec.ts` 守卫模块/测试表完整性。

## 剩余风险

- 派生值每行按切片查一次工单；列表当前未分页，规模大时需再评估。
- 「待关闭」只在 已确认/全部 过滤下可见（默认「待处理」不含已确认需求）；属冻结范围外，已在 issue 记录供 owner 决定是否另开需求。
- 截图来自两个隔离的本地面板与一次性种子，不是部署实例；Before 版本依赖 capture 日志与 main 特性可见性佐证，非密码学绑定。
- 全量 `check` 由实现 lane 执行并落盘；本评审 lane 只复跑子集与 typecheck（同一 worktree 并行评审）。

## 合并时序说明

owner 在 e3/e5 完成前合并了 PR #27；评审记录、回归案例与 issue 沉淀以基于新 main 的 docs-only follow-up PR 交付（含上述 findings 处置），不重开或改写已合并分支。
