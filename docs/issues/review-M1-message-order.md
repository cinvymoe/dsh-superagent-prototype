# 双轴评审 · M1 需求详情消息记录倒序 + 回复框上移

- Slice issue: `docs/issues/b92376fc87045bdd661562973b8aff37.md`
- Alignment: `q-627a7e26` / slice `M1`；source trigger `d6426d20557df9b7c63baafffe93b6d8`
- 基线：deployment `main` @ `6ed5fded`；分支 `agent/slice-b92376fc8704`
- 评审对象：工作区 diff（`src/client/discuss.tsx`、`src/client/client.css`、面板 fixture 与测试、docs 与 docs 测试、证据图）

## 执行记录（含未按计划发生的事）

- e2 派发 `lane-T1-1`（subagent `49152b19-2511-4b23-942d-968b6659eab0`，cwd 本工单目录）。该 lane **启动即失败**、未产出收尾消息，`git status` 确认它没有改动工作区（与此前 C2 切片记录的 lane 启动失败同型）。
- 依据既有先例，本次由 worker 在**同一任务契约**（`docs/issues/task-contract-b92376fc87045bdd661562973b8aff37.md`）下直接实施 T1，不再重复派发；失败事实记录在案，未伪造 lane 产出。

## 轴 A · Standards（仓库规范）

| # | 检查项 | 结论 | 依据 |
| --- | --- | --- | --- |
| S1 | 改动最小、无顺手重构 | PASS | `discuss.tsx` 只改排序比较器与时间线表单/列表的先后；`client.css` 只加 `.dt-timeline-form { margin-bottom: 8px; }` 一条规则；未触碰引擎、HTTP 路由、线程模型 |
| S2 | fixture 忠实镜像宿主而非「mock 的 mock」 | PASS | `LocalIssues.comment` 只更新 `updatedAt` 并 receive 一条人类 Trigger；fixture 原来把评论追加到 `issue.body`，会让详情页出现第二次原始描述，已改为只追加触发器并保持 body 不变 |
| S3 | 样式规范 | PASS | 新 class 被组件使用、一行一条规则；`tests/styles.spec.ts` 通过 |
| S4 | 文案与 locale | PASS | 未新增 key（复用 `discuss.timeline`/`discuss.comment`/`discuss.commentPlaceholder`/`discuss.agent`）；`tests/locales.spec.ts` 通过；测试断言 zh/en 页面都不出现 `discuss.` 残留 key |
| S5 | 文档与文档门禁 | PASS | `docs/005-panel.md` Requirements 行、`docs/007-architecture.md` 模块行与测试行同步；`tests/docs.spec.ts` 用 `prose()` 断言折叠空白后的整句；未新增模块或测试文件，模块/测试表无需扩表 |
| S6 | 测试有效性（防空跑） | PASS | 红跑：把 `discuss.tsx` 暂存回旧实现后 3 条新用例全红（`evidence/m1-timeline-red.log`：3 failed / 20 passed），恢复后 23/23 通过 |
| S7 | 断言方式稳健 | PASS | 顺序断言走 `.dt-timeline .dt-md` 渲染文本序列；输入框位置断言走 `compareDocumentPosition(...) & Node.DOCUMENT_POSITION_FOLLOWING`，不依赖文本偏移或 DOM 索引巧合 |
| S8 | 无越界 | PASS | 未改需求列表页、其它面板页、公开 API、schema、配置键语义 |

## 轴 B · Spec（冻结验收标准）

| 验收标准 | 结论 | 证据 |
| --- | --- | --- |
| AC1 含至少两条消息时第一条最新、从新到旧、最后一条最早 | PASS | `tests/panel-discuss.spec.tsx`「lists the message timeline newest first…」：预设 03:00 评论 / 02:00 智能体回复 / 01:00 评论，断言顺序 `Second follow-up, The agent answered, First follow-up`；真实面板 after 截图显示 11 分钟前（智能体）→ 17 分钟前 → 32 分钟前 |
| AC2 输入框在列表上方；提交后新消息在第一条、计数增加、输入框清空 | PASS | 同文件「posts a follow-up from the box above the list…」：`POST local/issues/q-fixture/comments` body `{ text }`，回填后 `messages()=['Newest follow-up','Earlier follow-up']`、`.dt-count` 2、textarea 值 `''`；两条用例都断言表单在 `ul.dt-timeline` 之前；before/after 截图对比表单位置 |
| AC3 原始需求描述只出现一次且不在消息记录；智能体回复仍显示「智能体」；空输入禁用提交 | PASS | 既有「shows a requirement text once…」仍通过；新用例断言描述在页面出现 1 次且 `timelineSection().textContent` 不含描述；智能体行含 `zh['discuss.agent']` 标签；空串与纯空白时按钮 `disabled` |
| AC4 `pnpm check` 通过；面板测试覆盖顺序与输入框位置；docs 测试通过 | PASS | `evidence/m1-timeline-check.log`：`tsc --noEmit` exit 0、63 files / 1292 tests passed、Build complete、整体 exit 0；`evidence/m1-timeline-targeted.log` 4 files / 47 tests；`evidence/m1-timeline-typecheck.log` exit 0 |
| AC5 中文与英文渲染正常、无缺失文案 key | PASS | 新用例英文场景断言 `en['discuss.timeline']`/`en['discuss.comment']`/`en['discuss.commentPlaceholder']` 与 `en['discuss.agent']`，并断言 `text()` 不含 `discuss.`；`tests/locales.spec.ts` 通过 |

## 视觉证据

- Before：`docs/evidence/m1-message-order/before-detail-messages.png` — 基线 `6ed5fded` 构建的真实面板（隔离 DSH profile `m1-before`，一次性 stateDir），1440×1500、light、zh-CN、种子项目 Widgets + 需求 `q-m1demo`（1 条原始提交 + 2 条人类评论 + 1 条智能体回复）。消息按 32→17→11 分钟前升序，补充信息框在列表**下方**。
- After：`docs/evidence/m1-message-order/after-detail-messages.png` — 本分支构建（同隔离 profile 方案、同种子数据、同视口/主题/语言）。消息按 11→17→32 分钟前降序，补充信息框在列表**上方**、紧贴「消息记录 3」标题下方。
- 两个临时服务（127.0.0.1:3097 与 127.0.0.1:3098）、临时 worktree、隔离 profile 与 stateDir 均已停止并删除，未使用线上 `superagent` 的真实工单或飞书内容。

## 架构影响

`arch_impact: local`。改动只在 `src/client`（面板渲染顺序与表单位置）、面板测试 fixture/用例与 `docs/005`、`docs/007` 两处描述；没有 `src/app`/`src/sources` 契约、HTTP 路由、存储 schema 或跨模块职责变化，也没有公共 API 变化。

## 风险与未覆盖点

- 同一毫秒内到达的两条消息顺序由稳定排序决定（先触发器后回复），真实时钟下不可复现，未额外构造 tie-breaker；如需严格确定性可在后续切片补 `(at, kind)` 次级键。
- 输入框提交后的置顶依赖服务端 `sentAt`/`at` 晚于既有消息（宿主 `comment` 用当前时钟），测试用确定性时间模拟该前提。
- lane 启动失败属平台侧问题，本次未深挖原因；已按先例由 worker 兜底实施。
