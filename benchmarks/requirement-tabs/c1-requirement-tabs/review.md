# C1 评审与测试证据 · 拆分新建需求与需求列表两个页签，精简提交页

- Run: `run-mwd8n3ey-2`（execute，policy A1），issue `q-612052e8:C1`
- Ticket: `de236aab51cc140a2178fc3fe96f2d3c`
- 分支：`agent/slice-de236aab51cc`，基线 `04cb0449`（deployment `main`，已合并 PR #10）
- 实现 lane：`lane-C1-1`（subagent `268cf49c-f89f-4887-92cd-9a4f8464863d`，T2 / high，完成并报告全部验证通过）
- 评审日期：2026-11-12

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/client/route.ts` | 页签顺序改为 概览、新建需求、需求列表、来源、触发、评估、执行、设置；`newRequirement` / `requirements`（列表、详情、`create`）路由；旧 `discuss` 路由迁移为对应需求页；`routeLabel` 的详情术语 |
| `src/client/app.tsx` | 两个页签的页面分派：`NewRequirementPage`、`RequirementList`、`RequirementDetail`、独立新建项目页 |
| `src/client/discuss.tsx` | 拆出只含描述表单的 `NewRequirementPage`、按当前项目取数的 `RequirementList`、`RequirementDetail`；详情页显式返回需求列表；详情消息记录不再重复需求原文 |
| `src/client/projects.tsx` | 项目切换停留在当前需求页签（新建需求/需求列表根），其它页签落到需求列表；新建项目成功落到新项目的需求列表；创建页返回/取消不创建 |
| `src/client/widgets.tsx` | `PageHead` 支持 `back={false}` 与显式返回目标 |
| `src/client/locales.ts` | 两个页签、描述输入、列表/详情新文案；移除标题输入与旧「讨论」文案；`discuss.timeline` 改为「消息记录」 |
| `src/app/local.ts` | `requirementTitle` 从描述首个非空行派生标题（折叠空白、截断 200）；`title` 变为可选；派生标题时线程首个 Trigger 只取完整描述；`issueEmpty` 拒绝空需求 |
| `src/app/http.ts`、`src/app/api.ts` | `POST local/issues` 的 `title` 可选、`body` trim；请求类型同步 |
| `src/core/errors.ts` | 新增 `issueEmpty` 用户错误 |
| `src/sources/local.ts` | 本地来源描述去掉「讨论」字样，与新页签一致 |
| `tests/fixtures/panel-server.ts` | `POST local/issues` 镜像服务端标题派生；`localThread` 的时间线带上原始需求 Trigger |
| `tests/local.spec.ts`、`tests/navigation.spec.ts` | 标题派生、空描述拒绝、旧 `discuss` 路由迁移 |
| `tests/panel-discuss.spec.tsx`、`tests/panel-projects.spec.tsx`、`tests/panel-overview.spec.tsx`、`tests/panel-panel.spec.tsx` | 新页签、提交、列表、详情返回、项目切换、旧路由与英文页签 |
| `docs/005-panel.md`、`docs/007-architecture.md` | 页签、两个需求页与模块/测试表 |

范围外且未改动：提交需求支持图片（同一 alignment 的其它切片）、对齐/派发/执行语义、其它面板页面布局、项目编辑/删除。

## 双轴评审

### Standards 轴

结论：**通过（approve）**。

- **模块边界**：两个需求页仍在 `discuss.tsx`；项目栏的导航规则留在 `projects.tsx`；路由与旧路由迁移集中在 `route.ts`；标题派生与线程文本在 `src/app/local.ts`（服务端单一来源），客户端只提交描述。没有新增第二套项目/需求数据源。
- **数据流**：新建需求页只提交 `{ body, project }`，服务端派生标题并保存完整描述；需求列表用既有 `GET local/issues?project=`；详情用既有 `GET local/issues/:id`。派生标题不再前置到线程消息，避免完整文本重复。
- **路由与返回**：`parseRoute` 把旧 `discuss`（含 `id`/`create`）映射到需求详情/新建项目/需求列表，旧会话不白屏；详情页头返回显式指向需求列表（replace），不依赖历史栈，因此深链或重载后也不会回到概览；新建需求页与需求列表页作为页签根不渲染返回按钮。
- **导航语义**：项目切换在「新建需求」或「需求列表」根上 replace，避免堆叠历史；从其它页签切换项目 push 并落到需求列表；新建项目成功 replace 到新项目需求列表。
- **可访问性**：页签仍是 `role=tablist`/`role=tab` 且当前项 `aria-selected`；`PageHead` 的返回按钮可缺省、可指定目标；行标题仍是可聚焦按钮。
- **测试质量**：断言可观察行为（页签文本与顺序、`aria-selected`、请求 query/body、行顺序与标签、返回后的页头、旧路由重载）；覆盖空描述禁用、标题派生与截断、完整文本只出现一次、时间线去重、项目切换三种落点、新建项目落点；未削弱既有断言。
- **仓库规范**：无新依赖；`git diff --check` 干净；`pnpm check` 全绿；`tests/docs.spec.ts` 的模块/测试表完整性通过。
- **独立评审 lane**：本运行时未再派生独立 review lane，由 worker 按上述清单完成自审并逐条留证；实现 lane 的验证结果与本次复跑一致。

### Spec 轴（按冻结验收标准逐条）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 页面页签依次为 概览、新建需求、需求列表、来源、触发、评估、执行、设置（英文对应），页面中不再出现「讨论」 | PASS | `tests/panel-overview.spec.tsx` 断言 8 个页签中英文本与顺序；`tests/panel-panel.spec.tsx` 断言英文 8 项；`src/client/locales.ts` 已无 `tab.discuss`/标题输入文案且 `grep 讨论` 在 client 无命中；语言切换截图与 DOM 均未见「讨论」 |
| 2 | 「新建需求」页只显示当前项目的提交表单与项目信息（项目名、执行仓库、可选 worktreeRoot），没有需求列表，也没有标着「概览」的返回按钮 | PASS | `panel-discuss` 用例断言页头为项目名、仓库可见、无 `#dt-page input`、无 `.dt-cards`、无 `.dt-page-head button`；`after-new-requirement.png` 中表单同时带项目 Tag |
| 3 | 「新建需求」页没有「一句话说明要做什么」的标题输入；只有需求描述输入，描述为空时不能提交 | PASS | 表单只有一个 `textarea`（`discuss.descriptionPlaceholder`），无标题 `input`；`panel-discuss` 用例断言空串/纯空白时提交按钮 disabled，填写后 enabled |
| 4 | 提交成功后需求标题取自描述首个非空行（折叠空白、超长截断），正文保存完整描述，详情与线程记录里完整文本只出现一次 | PASS | `src/app/local.ts` `requirementTitle`；`tests/local.spec.ts` 覆盖空行、折叠、200 截断、只提交描述时的标题/正文/Trigger 文本；`panel-discuss` 用例断言 POST body 不含 `title`、详情标题为首行、完整描述在页面出现 1 次且时间线不含该文本；`after-detail-derived.png` 显示需求原文一次、「消息记录 0」 |
| 5 | 「需求列表」页按当前项目列出需求（新到旧，含状态/对齐标签、时间、切片数）；点击一行进入详情，详情可返回需求列表而不是概览 | PASS | `panel-discuss` 列表用例断言顺序、开放/已关闭、待对齐/待审阅、切片数、项目过滤与取数 query；详情用例断言页头返回按钮文本为「返回需求列表」，点击后页头回到项目名且页签仍为需求列表；`after-detail.png` / `after-detail-back.png` |
| 6 | 在「新建需求」或「需求列表」切换项目时停留在当前页签并按新项目重新取数；从其他页签切换项目落到「需求列表」；新建项目成功后落在新项目的「需求列表」 | PASS | `panel-projects` 用例覆盖：需求列表切换保持页签并请求 `local/issues?project=p-other`；新建需求切换保持页签、项目 Tag 更新、提交 body 指向新项目；从概览切换落到需求列表；新建项目后页签为需求列表并请求新项目需求；`after-list-billing.png` |
| 7 | 会话里保存的旧路由（page=discuss，含 id/create）重载后打开对应的新页面，不白屏 | PASS | `tests/navigation.spec.ts` 覆盖 `discuss` + id/create/无参三种映射；`panel-discuss` 用 `at({page:'discuss', id})` 与 `at({page:'discuss'})` 重载后分别打开需求详情与需求列表，均有内容、无白屏 |
| 8 | `pnpm check` 通过；`docs/005-panel.md` 已描述两个页签与新文案；PR 含同场景 Before/After 截图 | PASS（截图待 PR 描述） | `pnpm check`：typecheck 0，63 files / 1259 tests，build 完成（`docs/issues/evidence/c1-requirement-tabs-check.log`）；`docs/005-panel.md` 新增 New requirement 与 Requirements 两行及新文案；Before/After 见下方视觉证据，PR 描述逐对标注 |

## 测试证据

- `pnpm typecheck`：exit 0，无诊断。
- `pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-overview.spec.tsx tests/panel-panel.spec.tsx tests/navigation.spec.ts tests/local.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts`：9 files / 75 tests passed（`docs/issues/evidence/c1-requirement-tabs-targeted.log`）。
- `env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check`：typecheck exit 0；63 files / 1259 tests passed；build complete；exit 0（`docs/issues/evidence/c1-requirement-tabs-check.log`）。
- `env -u … LC_ALL=C pnpm test`：63 files / 1259 tests passed（`docs/issues/evidence/c1-full.log`）。
- `pnpm build`：Build complete，exit 0。
- `git diff --check`：无输出。

## 视觉证据

同一场景、同一视口（1440×1100）、同一主题（浅色）、同一语言（zh-CN）；Before 为 deployment `main` @ `04cb0449` 的真实面板构建，After 为本分支 head 的真实面板构建。截图使用隔离 profile（`c1-before` 端口 3095 / `c1-after` 端口 3096）与一次性 stateDir（`/root/.dsh/state/c1-before`、`/root/.dsh/state/c1-after`），种子数据为两个项目（Widgets 带 `/srv/worktrees`、Billing）和四条需求（待对齐、待审阅 3 切片、已确认 2 切片、Billing 待对齐），未使用线上真实工单或飞书内容。

| 场景 | Before（main @ `04cb0449`） | After（本分支） |
| --- | --- | --- |
| 1440×1100，Widgets 项目的提交页 | `docs/evidence/c1-requirement-tabs/before-discuss.png`：讨论页同时有标题输入、正文输入与需求列表 | `docs/evidence/c1-requirement-tabs/after-new-requirement.png`：新建需求页只有项目信息与一个描述框，无标题输入、无列表、无返回按钮 |
| 1440×1100，Widgets 项目的需求列表 | `before-discuss.png` 同上（列表与表单同页） | `docs/evidence/c1-requirement-tabs/after-requirements.png`：需求列表页单独列出 3 条需求及状态/对齐标签、时间、切片数 |
| 1440×1100，需求详情与返回 | `before-detail.png`：讨论页内的需求详情，底部「返回需求列表」、页头返回「讨论」 | `docs/evidence/c1-requirement-tabs/after-detail.png`：需求详情的页头返回为「返回需求列表」，点击后回到需求列表（`after-detail-back.png`） |
| 1440×1100，Billing 项目空列表 | `before-list-billing.png`：讨论页内 Billing 表单与 1 条需求 | `docs/evidence/c1-requirement-tabs/after-list-billing.png`：需求列表页只显示 Billing 的 1 条需求，项目信息随项目切换 |
| 1440×1100，独立新建项目页（行为不变） | `before-new-project.png` | `docs/evidence/c1-requirement-tabs/after-new-project.png`：页头返回「需求列表」，创建成功后落到新项目需求列表 |
| 只提交描述后的详情（补充，无 before 对照） | — | `docs/evidence/c1-requirement-tabs/after-detail-derived.png`：标题取自描述首行，需求原文完整出现一次，「消息记录 0」不重复原文 |

## 架构影响

- 影响面：`src/client` 的路由、页面壳、两个需求页、项目栏返回语义与文案；`src/app/local.ts` 的本地需求创建契约与 `POST local/issues` 的 `title` 可选；测试 fixture 与文档。无 `src/app/**` 之外的宿主数据模型、schema 迁移、安全/凭据或部署行为变更。
- 旧路由保留为 `parseRoute` 的迁移分支，不删除本地需求数据；`LocalIssue.title` 仍是记录字段（由服务端派生），`body` 保存完整描述。
- 判定：`arch_impact: local`。

## 过程记录

- 实现 lane `lane-C1-1` 一次完成实现、测试与两篇文档，并报告 typecheck、定向 9 files / 75 tests、全量 63 files / 1259 tests、build 与 `git diff --check` 全部通过。
- worker 复核 diff，补充/校正：把 `src/sources/local.ts` 的来源描述从「提交需求、讨论…」改为与新页签一致的「提交需求并审阅…」，并补齐两个测试文件的末尾换行；随后重跑定向、全量 check 与 `git diff --check`。
- 截图环境为一次性 profile 与 stateDir；截图完成后停止两个临时服务。
- PR 冲突修复：deployment `main` 已前进到 `afab266e`，把 `main` 合入本分支并解决 `docs/issues/review.md` 与证据日志同名冲突（本切片评审为 `docs/issues/review-C1-requirement-tabs.md`，main 的 C1 评审保留 `review.md`；本切片日志为 `c1-requirement-tabs-*.log`）。合并后重跑 `pnpm check`：63 files / 1263 tests + build 通过。
