# Review · C1 · Open a linked Ticket's Executor Session from the requirement detail

- Ticket: `e31c18f685181583474b8abb3739bc6b`（alignment `q-b91966d0` C1）
- Branch: `agent/executor-session-e31c18f68518`
- Base: deployment `main` @ `6ed5fded`
- Slice commit: `8d91002`（本文档另行提交在其后）
- 评审范围：`src/client/discuss.tsx`、`tests/panel-discuss.spec.tsx`、`docs/005-panel.md`、`docs/issues/**`、`docs/evidence/e31c-session-buttons/**`

## Standards 轴

| 检查点 | 结论 | 依据 |
| --- | --- | --- |
| 复用既有组件与文案 | PASS | 直接使用 `widgets.tsx` 的 `SessionButton`（`variant="outline"`，与工单列表行一致）与既有 locale `openSession`；无新增 locale 键、无新按钮组件 |
| 数据来源单一 | PASS | 条件取 `TicketSummaryView.sessionId`，即 `ticketSummary` 中「存在已启动 Assignment」时由 `workerSessionId` 生成的值；与工单列表行、工单详情 Assignment ref 使用同一来源，未新开数据通路 |
| 交互与无障碍 | PASS | 标题仍是 `dt-textlink` 按钮，点击进入 Execution 详情；Session 按钮是独立 `Button`，与标题不嵌套；按钮自带 `session` 图标与本地化文本，可键盘聚焦 |
| 布局与样式 | PASS | 按钮放在既有 `.dt-row-actions` 容器（`margin-left: auto`、`pointer-events` 规则既有），不改 CSS；截图显示 1440px 下右对齐、无换行/遮挡 |
| 测试质量 | PASS | 新用例用既有 fake server 与 helpers；每个测试重置 `server` 与 `sessionStorage`；断言精确计数 `[1,0,1]`、`server.opened` 精确为 `['worker-t3']`，标题点击后 `opened` 不变并请求 `tickets/t1`；英文 `Open Session` 与相同条件渲染；未削弱既有断言 |
| 文档一致性 | PASS | `docs/005-panel.md` 的 Requirements 行补充「Open Session」说明；`docs/007` 的模块/测试表无需变化（无新模块/新测试文件），`tests/docs.spec.ts` 通过 |
| 代码风格 | PASS | import 按既有字母序追加 `SessionButton`；单行条件渲染与 `rows.tsx`/`ticket.tsx` 的写法一致；`git diff --check` 干净 |

发现与处理：无阻断项。jsdom 无法验证视觉位置，已用真实面板 Before/After 截图补齐（见下）。

## Spec 轴（冻结验收标准逐条）

| # | 验收标准 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 有已启动会话工单的关联工单行显示本地化「打开 Session」，点击只打开该工单的 Executor Session（`server.opened` 观察到正确 session id） | PASS | 新用例断言两枚按钮（t1 `worker-t1`、t3 `worker-t3`），点击 t3 后 `server.opened === ['worker-t3']`；之后点击标题仍为 `['worker-t3']` |
| 2 | 没有启动过 Executor Session 的关联工单不渲染 Session 按钮 | PASS | `sessionId: ''` 的 t2 行按钮计数 0；真实面板截图 `after-linked.png` 同一行无按钮 |
| 3 | 工单标题链接仍进入该工单的 Execution 详情页 | PASS | 用例点击 t1 标题后断言 `GET tickets/t1` 且页头为 `修复回归`，且未新增 `server.opened` |
| 4 | 中文与英文均显示既有「打开 Session / Open Session」，无需新增 locale 键 | PASS | 断言 zh/en 按钮计数 `[1,0,1]`；diff 未改 `src/client/locales.ts`；`tests/locales.spec.ts` 通过 |
| 5 | `pnpm check`（typecheck + test + build）通过，新增测试在 `tests/panel-discuss.spec.tsx` | PASS | 干净环境 `pnpm check`：typecheck exit 0、63 files / 1288 tests passed、build complete、exit 0（`docs/issues/evidence/c1-session-check-clean.log`） |
| 6 | `docs/005-panel.md` 的 Requirements 行说明关联工单可打开其 Executor Session | PASS | 该行新增 "each linked Ticket that started an Executor Session offers **Open Session** to open it" |

## 测试证据

- 定向：`env -u GIT_CONFIG_GLOBAL ... LC_ALL=C pnpm vitest run tests/panel-discuss.spec.tsx tests/docs.spec.ts tests/locales.spec.ts` → 3 files / 41 tests passed（`c1-session-targeted.log`）。
- typecheck：exit 0（`c1-session-typecheck.log`）。
- 全量：`env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check` → exit 0，63 files / 1288 tests passed，build complete（`c1-session-check-clean.log`）。
- 宿主环境差异说明：直接 `pnpm check` 时 3 个失败（`tests/environment.spec.ts` 1、`tests/runtime.spec.ts` 2），原因是宿主进程带 `GIT_CONFIG_GLOBAL=/root/.dsh/state/superagent/worker-gitconfig` 与 `LANG=zh_CN.UTF-8`（git 报错被本地化，测试期望英文 `bad config`）。同一宿主环境下未改动基线 `6ed5fded` 的原文件复跑得到完全相同的 3 个失败（`c1-session-baseline-hostenv.log`：3 failed / 102 passed；干净环境基线同文件 105 passed：`c1-session-baseline-clean.log`），确认与本切片无关；干净环境下本分支全量通过。
- TDD：lane 先跑新用例得到红（按钮计数 `[0,0,0]`），实现后转绿；worker 复核 diff 后复跑全部命令。

## 视觉证据

同一场景（项目 Widgets；需求「导出工单列表为 CSV」；关联工单 3 张：`修复导出权限校验` 与 `导出任务进度提示` 已启动会话、`补齐导出接口分页` 未启动）、同一视口 1440×1100、浅色、zh-CN、同一份隔离测试数据（未使用线上工单或飞书内容）。Before 为 deployment `main` @ `6ed5fded` 的真实面板构建；After 为本分支 head `8d91002` 的真实面板构建。

| 场景 | Before | After |
| --- | --- | --- |
| 需求详情整页（关联工单区可见） | `docs/evidence/e31c-session-buttons/before-detail.png` | `docs/evidence/e31c-session-buttons/after-detail.png` |
| 关联工单区特写 | `docs/evidence/e31c-session-buttons/before-linked.png`（三行均无按钮） | `docs/evidence/e31c-session-buttons/after-linked.png`（第 1、3 行「打开 Session」，第 2 行无） |

截图复现要点：以相同 seed（1 项目、1 需求、3 张关联工单，其中 2 张有已启动 Assignment）分别启动基线与本分支 profile（端口 3097/3098，独立一次性 stateDir），收起 shell 侧边栏后 `#dt-page` 截图；输出见 `c1-session-capture.log`。

## 架构影响

- 影响面仅 `src/client` 的一个既有视图（需求详情「关联工单」区）与一个既有测试文件、一篇产品文档；无 `src/app/**`、宿主 API、schema、路由、locale 键或部署行为变化。
- `docs/007` 模块表与测试表无需新增条目（无新模块/新测试文件）；`tests/docs.spec.ts` 11/11 通过。
- 判定：`arch_impact: local`。

## 结论

Standards 与 Spec 双轴均 PASS；6 条冻结验收标准全部有代码、测试或截图证据覆盖；无遗留阻断项，PR 交人复核合并（不自动合并）。
