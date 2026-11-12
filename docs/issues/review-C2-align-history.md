# C2 双轴评审 —— 需求列表与详情展示对齐历史

- Slice: `C2`（issue `q-29218185`；依赖 C1）
- Ticket: `9475bcf31c6087ebf919ad094091ef2b`
- Run: `run-mwdss6mm-2`
- 评审对象：本工作树 merge 后的实现（`9adaaa19` + merge `422a21a4` 的 `98517a59`，以及其后的单时间/夹具保真修正）
- 独立验证 lane：`lane-T1-1`（subagent，结论 4/4 冻结判据 PASS；其指出的索引未 `git add` 的交付风险已在合并提交前修复）

## 轴一：Standards（代码标准与仓库约定）

| 关注点 | 结论 | 证据 |
| --- | --- | --- |
| 模块边界 | 通过：轮次读取复用 `src/sources/local-format.ts` 的 `alignmentRounds` / `currentAlignment`，面板只读；未新增宿主写路径 | `src/client/discuss.tsx:299-301`、`:284-296` |
| 单一写入者 | 通过：决定仍只经 `POST local/issues/:id/alignment/decision`，`decide()` 只携带当前轮 `roundId`，面板不编辑对齐内容 | `src/client/discuss.tsx:284-296`；`src/app/local.ts:305-330` |
| 复用既有原语 | 通过：旧轮折叠复用 `DisclosureRow`（`role="button"` + `aria-expanded` + Enter/Space），未另造折叠控件 | `src/client/controls.tsx:152-170`、`src/client/discuss.tsx:100-110` |
| 可访问性 | 通过：折叠行保留键盘操作与展开状态；`<time>` 保留原始时间 title | `DisclosureRow`、`widgets.tsx:When` |
| 状态语义 | 通过：`statusTag` 只看单轮状态（含 `superseded`），列表桶与详情头用 `currentAlignment` 判定当前轮 | `src/client/discuss.tsx:56-64`、`:172-174`、`:317` |
| 双语 | 通过：4 个新键中英齐全、占位符一致（`{count}` / `{round}`），`tests/locales.spec.ts` 全局校验 | `src/client/locales.ts:192-195` |
| 样式 | 通过：新增规则一行一条、复用 `--dsw-alias-*` 令牌，`tests/styles.spec.ts` 通过 | `src/client/client.css:144-149` |
| 测试质量 | 通过：三条验收用例 + 陈旧轮次拒绝用例；两轮 fixture 由 `twoRounds()` 生成；夹具 propose/decision 与宿主同形（supersede、镜像同步、`alignmentConfirmed`、round id 冲突回避、旧 `roundId` 拒绝带 `values.round`） | `tests/panel-discuss.spec.tsx:617-712`、`tests/fixtures/panel-server.ts:446-477` |
| 文档 | 通过：`docs/005-panel.md` Requirements 行、`docs/007-architecture.md` 模块/测试行与 `tests/docs.spec.ts` 断言同步 | `docs/005-panel.md:23`、`docs/007-architecture.md:403,434`、`tests/docs.spec.ts:142-156` |
| 合并卫生 | 通过（已修复）：main @ `422a21a4` 合并冲突逐项解决；`local-format` 保留 `LocalIssueView` 与轮次读取器，`local.ts` 的 `list()` 不再派生 HTTP 字段、`view()` 先归一化轮次，`api.ts` 维持 `LocalIssueView` + 可选 `roundId` | merge `98517a59` |

### 非阻塞观察（LOW）

- 当前轮的元信息同时显示提议时间与决定时间（旧单轮布局同款），未加标签；不是本 slice 的回归，保持现状。
- 三笔以上轮次的序号未单独加用例（实现按 `earlier.length - index` 逆序编号，代码检视正确）。
- 折叠行只显示“决定时间或提议时间”中的一个，避免同一相对时间重复出现；展开后的元信息仍展示两者。

## 轴二：Spec（对照冻结验收标准）

| 冻结判据 | 结论 | 证据 |
| --- | --- | --- |
| 两轮 fixture 下详情渲染两轮；当前轮含摘要/切片/验收 | PASS | 用例 “renders every alignment round, expands only the current one…”：`.dt-round-current` 含 `第二轮摘要/第二轮切片/第二轮验收`、`第 2 轮`、`当前轮`；`docs/evidence/c2-align-history/after-detail.png` |
| 旧轮折叠、可展开，展开后可见该轮摘要/切片/验收；折叠态可见打回原因与时间 | PASS | 折叠态 `aria-expanded=false`，含 `已打回`、`打回原因：范围太大，请拆分`、`<time>`，且不渲染第一轮正文；点击后 `aria-expanded=true` 并出现第一轮摘要/切片/验收；`after-detail.png`、`after-detail-expanded.png`、`after-history.png` |
| 列表行显示轮数（两轮行显示 2 轮；无对齐行不显示） | PASS | 行元信息 `2 轮对齐`；`全部` 视图显示 `2 轮对齐` / `1 轮对齐` / 无对齐行无轮数；`after-list.png`、`after-list-all.png` |
| 确认/打回只在当前 `proposed` 轮出现，旧轮无决定按钮 | PASS | 用例断言按钮集合 = `[确认对齐, 打回]` 且都位于 `.dt-round-current`，`.dt-rounds-history .dt-actions` 为 null；确认后按钮消失 |
| 决定请求携带当前 `roundId` | PASS | 请求体 `{ decision: 'confirm', roundId: 'al-2' }`；陈旧轮次拒绝用例显示 `userError.alignmentRoundStale` 本地化文案 |
| 双语键齐全 | PASS | `tests/locales.spec.ts` 6 tests 通过；面板用例 remount(en) 断言 `Current round` / `Round 2` / `Reason` |
| `docs/005-panel.md` Requirements 行写明轮次历史 | PASS | 行内含轮数、当前轮展开、旧轮折叠可展开、打回原因与时间、决定只作用于当前轮；`tests/docs.spec.ts` 新增 3 条断言 |
| 目标命令通过 | PASS | `pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts`：3 files / 59 tests；`pnpm typecheck` exit 0；全量 `pnpm check` 见 `docs/issues/evidence/c2-align-history-check.log` |
| PR 描述含同视口同主题 before/after 截图并标注版本 | PENDING（交付步骤） | 截图已生成于 `docs/evidence/c2-align-history/`（1440×1100、light、zh-CN、同一 SQLite 种子）；Before = `agent/slice-9e69570faa5d` @ `6dc5144b`（C1，PR #30，本 slice 的栈底），After = 本分支 head |

## 结论

- Standards：approve。
- Spec：冻结判据全部 PASS；PR 证据项在 e4 完成。
- 架构影响：`local`（仅面板读侧、文案、样式、夹具/测试与文档；无公共 API、无 schema、无凭证改动）。
