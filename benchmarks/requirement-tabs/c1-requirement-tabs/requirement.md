---
arch_impact: local
pr_status: open
pr_url: https://github.com/cinvymoe/dsh-superagent-prototype/pull/12
pr_arch_impact: local
worktrees: []
---

# C1 · 拆分「新建需求」与「需求列表」两个页签，精简提交页

- Alignment issue: `q-612052e8`
- Slice: `C1`（本次执行）
- Source trigger: `f4718412a134de180bf3ef9e9ab9072a`（`local:q-612052e8`）
- Flow: execute / scope: shared / product: shared / policy: A1
- 基线：deployment `main` @ `04cb0449`（已合并 PR #10）。执行计划已在 Discuss 面板确认，本切片按冻结验收标准执行，不再重开需求讨论。

## 需求原文

> 1 讨论tab 改为 新建需求  新建需求页面 删除 概览 button   2 新建需求 去掉 一句话说明作什么 3 需求列表拆出来单独新增 需求列表列  4 提交需求 需要支持 图片

本切片只交付第 1–3 点：把原「讨论」页签拆成「新建需求」与「需求列表」两个页签，并精简提交页。提交需求支持图片属于同一 alignment 的其它切片，不在本次范围。

## 验收标准（冻结版）

- 页面页签依次为 概览、新建需求、需求列表、来源、触发、评估、执行、设置（英文对应），页面中不再出现「讨论」
- 「新建需求」页只显示当前项目的提交表单与项目信息（项目名、执行仓库、可选 worktreeRoot），没有需求列表，也没有标着「概览」的返回按钮
- 「新建需求」页没有「一句话说明要做什么」的标题输入；只有需求描述输入，描述为空时不能提交
- 提交成功后需求标题取自描述首个非空行（折叠空白、超长截断），正文保存完整描述，详情与线程记录里完整文本只出现一次
- 「需求列表」页按当前项目列出需求（新到旧，含状态/对齐标签、时间、切片数）；点击一行进入详情，详情可返回需求列表而不是概览
- 在「新建需求」或「需求列表」切换项目时停留在当前页签并按新项目重新取数；从其他页签切换项目落到「需求列表」；新建项目成功后落在新项目的「需求列表」
- 会话里保存的旧路由（page=discuss，含 id/create）重载后打开对应的新页面，不白屏
- `pnpm check` 通过；`docs/005-panel.md` 已描述两个页签与新文案；PR 含同场景 Before/After 截图

## 范围

范围内：

- `src/client/route.ts`：页签顺序、`newRequirement` / `requirements` 路由、旧 `discuss` 路由迁移、详情页的返回目标记忆。
- `src/client/app.tsx`：两个页签的页面渲染与路由分派。
- `src/client/discuss.tsx`：拆出「新建需求」页与「需求列表」页；详情页返回需求列表；描述提交与标题派生后的展示去重。
- `src/client/projects.tsx`：项目切换停留在当前页签或落到需求列表；新建项目成功落到新项目的需求列表。
- `src/client/widgets.tsx`：`PageHead` 可关闭返回按钮、可为详情页指定返回目标。
- `src/client/locales.ts`：两个页签、描述输入、需求列表与详情返回的新文案；移除标题输入文案。
- `src/app/local.ts`、`src/app/http.ts`：由服务端从描述首个非空行派生标题（折叠空白、截断到 200），正文保存完整描述，线程记录不重复完整文本。
- `src/client/api.ts`、`tests/fixtures/panel-server.ts`：提交接口与 fixture 的契约同步。
- `tests/panel-discuss.spec.tsx`、`tests/panel-projects.spec.tsx`、`tests/panel-overview.spec.tsx`、`tests/panel-panel.spec.tsx`、`tests/navigation.spec.ts`、`tests/local.spec.ts`：覆盖冻结验收标准。
- `docs/005-panel.md`、`docs/007-architecture.md`：页签、提交页、列表页与新文案；模块/测试表同步。
- `docs/issues/`、`docs/evidence/`、`benchmarks/`：切片记录、评审、验证证据、Before/After 截图与回归案例。

范围外：

- 提交需求支持图片（同一 alignment 的其它切片）。
- 宿主 `local/issues` 之外的数据模型、对齐流程、工单派发与执行语义。
- 其他面板页签（概览、来源、触发、评估、执行、设置）的既有布局。
- 项目编辑/删除、项目栏溢出「更多」与独立创建项目的既有行为。

## 任务拆解

- **C1（本次）** 拆分页签与精简提交页：按上面「范围内」逐项实现，补测试、文档、证据、Before/After 截图与 PR；切片完成后不合并，交由人复核。
- 同一 alignment 的其它切片（提交需求支持图片等）不在本次范围；本工单只交付 C1。

## 实现方案（要点）

- **页签与路由**：`TABS` 变为 `overview`、`newRequirement`、`requirements`、`source`、`trigger`、`eval`、`execution`、`settings`；`Route` 增加 `newRequirement`（仅提交页）与 `requirements`（列表 / 详情 / `create` 新建项目子页）。`parseRoute` 把旧的 `page: 'discuss'` 迁移为：带 `id` → 需求详情；带 `create` → 新建项目页；否则 → 需求列表。旧会话路由因此不会白屏。
- **新建需求页**：只渲染当前项目的页头（项目名、执行仓库、可选 `worktreeRoot`）与一个描述文本框；无标题输入、无需求列表、无「概览」返回按钮（`PageHead` 允许不渲染返回按钮）。描述 trim 后为空时提交按钮禁用。
- **标题派生与去重**：`POST local/issues` 的 `title` 变为可选；服务端 `LocalIssues.create` 从描述首个非空行生成标题（折叠连续空白、截断到 200 字符），正文保存完整描述。线程首个 Trigger 的文本在标题由描述派生时只取完整描述，不再前置标题，因此详情与线程记录里完整文本只出现一次。详情页的需求原文只渲染完整描述一次，讨论记录不再重复原始需求那条消息。
- **需求列表页**：按当前项目 `GET local/issues?project=` 取数，新到旧，行内含状态标签、对齐标签、时间、切片数；点击行标题进入 `requirements` 详情。
- **详情返回**：详情页的页头返回按钮显式指向「需求列表」（而非概览）；直接重载详情路由时路由记忆把需求列表作为返回目标。
- **项目切换**：在「新建需求」或「需求列表」（列表根）切换项目时停留在当前页签并用新项目重新取数；从其它页签切换落到「需求列表」；新建项目成功后 `setProject` 并跳到新项目的「需求列表」。
- **文档**：`docs/005-panel.md` 的页签列表与两张页签说明、`docs/007-architecture.md` 的模块/测试表同步。

## 验证计划

- `pnpm typecheck`。
- `pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-overview.spec.tsx tests/panel-panel.spec.tsx tests/navigation.spec.ts tests/local.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts`。
- `env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check`（typecheck + 全量 vitest + build）。
- `git diff --check`。
- 真实面板截图：同一场景、同一视口（1440×1100）、同一主题（浅色）、同一语言（zh-CN）；Before = deployment `main` @ `04cb0449`，After = 本分支 head；证据写入 `docs/evidence/c1-requirement-tabs/`。

## 交付与沉淀

- 提交：`f4413fc`（实现、测试、文档、Before/After 截图、评审、PR 记录与验证日志）。
- PR：https://github.com/cinvymoe/dsh-superagent-prototype/pull/12 ，`pr_status: open`、`pr_arch_impact: local`。部署仓库 `cinvymoe/dsh-superagent-prototype` 可推送；按交付要求由人复核合并，未启用 auto-merge。
- 测试：`pnpm typecheck` exit 0；定向 9 files / 75 tests（`docs/issues/evidence/c1-requirement-tabs-targeted.log`）；`env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm check` 通过（63 files / 1259 tests + build，`docs/issues/evidence/c1-requirement-tabs-check.log`）；全量 `pnpm test` 63 files / 1259 tests（`docs/issues/evidence/c1-full.log`）；`git diff --check` 干净。
- 视觉证据：Before = deployment `main` @ `04cb0449` 的真实面板；After = 本分支 head `f4413fc` 的真实面板；同一场景（提交页、需求列表、详情与返回、Billing 项目、独立新建项目页、仅描述提交后的详情）、1440×1100、浅色、zh-CN，文件在 `docs/evidence/c1-requirement-tabs/`，PR 描述已逐对标注。
- 双轴评审：`docs/issues/review-C1-requirement-tabs.md`（P1 的评审已归档为 `docs/issues/review-P1-project-tabs.md`）。
- 回归案例：`benchmarks/requirement-tabs/c1-requirement-tabs/`。
- 过程限制：实现 lane `lane-C1-1`（subagent `268cf49c-f89f-4887-92cd-9a4f8464863d`）一次完成实现、测试与两篇文档；worker 复核后把 `src/sources/local.ts` 的来源描述改成与新页签一致，并补齐两个测试文件的末尾换行，随后重跑定向与全量检查。
- 截图环境：隔离 profile `c1-before`（3095）/ `c1-after`（3096）与一次性 stateDir `/root/.dsh/state/c1-*`；截图完成后停止两个临时服务；临时基线 worktree `/tmp/c1-before` 为一次性产物。
- 范围外：提交需求支持图片（同一 alignment 的其它切片）。