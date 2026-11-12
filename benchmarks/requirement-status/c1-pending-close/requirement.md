# 需求快照与冻结验收

- Alignment issue: `q-e421cac7`（Discuss 面板已确认，`decidedAt` 2026-11-12T15:33:05.086Z）
- Source trigger: `27c51960d2009febc028e925dcf70632`（thread `local:q-e421cac7`）
- 原文（未改写）：`需求列表 如果全部执行完毕 状态 新增待关闭`
- 完整对齐记录：`docs/issues/evidence/c1-pending-close-alignment.json`

## 对齐拍板的语义

- 「全部执行完毕」= alignment 已 confirmed、至少有 1 个切片、当前 alignment 的每个切片都能按 core 的稳定 ticket id 找到对应工单、且这些工单全部已有 `ended` 记录。
- 结束方式不区分：executor 的 ready（completed / merged / closed）、dropped 以及 owner 手动停止（stopped）都算执行完毕；「待关闭」只表示执行已停止、只剩关闭动作，不声称任务成功。
- 零切片或任一切片缺工单（历史/异常数据）一律不算执行完毕，避免误报。
- 「待关闭」加在需求状态上，不替换对齐标签：完成行读作 [待关闭][已确认]；需求关闭后只显示「已关闭」；未对齐、待审阅、已打回、仍在执行的需求仍是「开放」。
- 状态读取时派生、不落库：`LocalIssueView = LocalIssue & { slicesFinished }`，`LocalIssues.view()` 计算；列表、详情以及创建/评论/对齐/确认/关闭的返回体统一返回视图；`planTicketId()` 是切片工单 id 的唯一来源。
- 范围外：自动关闭、N/M 进度或耗时统计、改工单结束规则/对齐语义/TicketOutcome 集合、改其它页面或标签、回填历史数据。

## 冻结验收标准（逐字）

1. 已确认对齐的需求只要还有切片工单未结束，`GET local/issues` 与 `GET local/issues/:id` 返回的 `slicesFinished` 为 false，列表行与详情页头的状态标签仍为「开放」。
2. 该需求每个切片工单都 ended 后，两个接口返回 `slicesFinished: true`，open 需求的列表行与详情页头状态显示「待关闭」/「Pending close」，对齐标签仍是「已确认」；executor 的 ready 结束与 owner 停止（stopped）两种方式都计入。
3. 需求关闭后状态只显示「已关闭」，不再显示「待关闭」；无对齐、待审阅、已打回的需求状态仍为「开放」；已确认但切片工单缺失或切片为零的需求不会误显示「待关闭」。
4. `slicesFinished` 只出现在 HTTP 视图响应中：`runtime.local.get()` / `list()` 返回的存储记录不含该字段（无持久化、无迁移）。
5. `pnpm check`（typecheck + vitest + build）通过；新增/更新的测试覆盖上述服务端与面板行为，双语 locale 无缺键或占位符差异。
6. `docs/005-panel.md` 与 `docs/007-architecture.md` 已更新且 `tests/docs.spec.ts`、`tests/class-docs.spec.ts` 通过。
7. PR 描述含同场景、同视口（1440×1100）、浅色主题、zh-CN 的需求列表 Before（main 基线 head）与 After（本分支 head）真实截图，并标注两侧版本；基线无法取得时如实说明限制，不用伪造图。
