# P1 评审与测试证据 · 顶部项目 Tab、更多菜单与独立新建项目界面

- Run: `run-mwd2vazl-5`（execute，policy A1），issue `q-539e143e:P1`
- Ticket: `72eef87fa22817c7628e4a74ecffb1a0`
- 分支：`agent/tab-72eef87fa228`，基线 `3b8c6a8`（deployment `main`，已合并 PR #9）
- 实现 lane：`lane-T1-project-tabs-1`（subagent `80c7e4b7-2b69-456a-be6c-375a79850660`，T2 / high，完成并报告全部验证通过）
- 评审日期：2026-11-12

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/client/projects.tsx`（新增） | 面板顶部项目栏：项目 chip Tab、溢出「更多」菜单、顶部新建项目按钮；独立的新建项目页（三个字段、校验、取消/返回、提交后设为当前项目并回到 Discuss） |
| `src/client/app.tsx` | 项目栏置于 Header 与页面 Tab 之间；`{ page: 'discuss', create: true }` 渲染独立创建页；`Location.project` 与 `setProject`；navigate/back/openTab 保留当前项目 |
| `src/client/provider.tsx` | `PanelContext.project` / `setProject`；轮询 `GET local/projects`，暴露 `projects` / `reloadProjects` |
| `src/client/discuss.tsx` | 需求列表、页头、新建需求目标按当前项目作用域；显示执行仓库与可选 `worktreeRoot`；无项目提示；移除项目列表、内嵌创建表单、项目筛选与「只看/全部」链接 |
| `src/client/route.ts` | Discuss 的 `create` 子路由、`routeLabel`、`Location.project` 的解析与持久化 |
| `src/client/locales.ts` | 新增 `project.more` / `project.menu`；移除不再使用的 `discuss.useProject` / `discuss.allProjects` / `discuss.projectRequired` |
| `src/client/client.css` | 项目 chip / 滚动条隐藏 / 更多菜单 / 新建按钮样式，窄屏换行 |
| `tests/fixtures/panel-server.ts` | `POST local/projects` 唯一 id；`GET local/issues?project=` 过滤；`POST local/issues` 落 `body.project` |
| `tests/panel-discuss.spec.tsx` | 独立创建页、提交后当前项目与 Discuss 作用域、空值与相对路径拒绝 |
| `tests/panel-projects.spec.tsx`（新增） | Tab 切换与 Discuss 作用域、页面 Tab 仍可用、新建需求目标；溢出「更多」出现/菜单/选择；独立创建、取消与返回、空值省略、提交后当前 Tab |
| `docs/005-panel.md`、`docs/007-architecture.md` | 项目栏、「更多」菜单、独立创建流程；模块表与测试表 |

范围外且未改动：`src/app/**`、宿主 API/schema、`worktreeRoot` 语义、其他面板页面布局。

## 双轴评审

### Standards 轴

结论：**通过（approve）**。

- **模块边界**：项目栏与独立创建页集中在新增 `projects.tsx`；`provider.tsx` 只负责共享项目列表与当前项目上下文；`discuss.tsx` 只负责当前项目需求；路由记忆仍集中在 `route.ts`。没有新增第二套项目数据源或把展示逻辑塞进宿主。
- **数据流**：当前项目是 `Location.project`（随路由记忆持久化），选择项目只写该字段并进入 Discuss；Discuss 使用既有 `GET local/issues?project=` 取数，没有客户端全量拉取再过滤；切换项目会重新订阅请求，`usePoll` 的依赖包含 `active?.id`，旧响应不会被误用。
- **导航语义**：项目切换在 Discuss 内使用 replace，避免来回切换堆积历史；创建成功与取消同样 replace，离开创建页的返回按钮不会回到已失效的创建页；`move` 先展开当前 location，保证 navigate/back/openTab 不丢当前项目。
- **可访问性**：项目栏是独立的 `role=tablist`（`aria-label` 为「项目」），每项 `role=tab` 且当前项 `aria-selected`，与页面 Tab 的 `role=tablist`/分段样式语义和视觉均可区分；「更多」按钮 `aria-haspopup="menu"` + `aria-expanded`，菜单项 `role=menuitemradio` + `aria-checked`，Escape/外部点击关闭；溢出时选中项 `scrollIntoView` 保持可见。
- **样式规范**：只使用现有 DSH token；项目 chip、菜单与按钮样式一行一条规则；`tests/styles.spec.ts` 通过。
- **测试质量**：断言可观察行为（`aria-selected`、请求 query、POST body、页面标题、列表行、`role=menuitemradio`）而非实现细节；溢出测试用实例级可恢复的布局桩，不依赖 jsdom 的 0 尺寸；未削弱既有断言。
- **仓库规范**：无新依赖；`git diff --check` 干净；`pnpm check` 全绿；`docs/007` 模块/测试表由 `tests/docs.spec.ts` 完整性校验通过。
- **独立评审 lane**：本运行时未再派生独立 review lane，由 worker 按上述清单完成自审并留证；实现 lane 的验证结果与本次复跑一致。

### Spec 轴（按冻结验收标准逐条）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 面板顶部为每个本地项目显示项目 Tab（`role=tab`，当前 `aria-selected`），页面 Tab 仍可用；两者视觉/语义可区分 | PASS | `tests/panel-projects.spec.tsx` 第一例断言项目 tablist 2 个 Tab、`aria-selected` 为 `true/false`、页面 tablist 7 个且 Discuss 仍选中；切到「概览」再回「讨论」后当前项目保持；独立 `role=tablist` + chip 样式（截图 `after-discuss.png` / `after-overflow.png`） |
| 2 | 选择项目 Tab 后 Discuss 需求列表、页头、新建需求目标同步；切换不串数据 | PASS | 第一例切换后页头为 `Other`、只显示 `Other requirement`、请求 `local/issues?project=p-other`；随后提交新需求 POST body 为 `{title:'Other target', project:'p-other'}`；页头显示 `项目：Other · acme/other` |
| 3 | 放不下时 Tab 行末尾出现「更多」；可从未显示项目中选择；选中后可识别；所有项目始终可达，不出现只有横向滚动而无「更多」 | PASS | 第二例：无溢出时 `.dt-project-more` 为空；布局桩使 `scrollWidth=640 > clientWidth=320` 后「更多」出现，菜单列出全部 6/2 个项目、当前项 `aria-checked=true`，选择后项目变为 `aria-selected=true` 且 Discuss 重新取数；真实面板 900×1100 截图 `after-overflow.png` 与 `after-more-menu.png`、选择隐藏项目后的 `after-more-selected.png`（strip 已滚动、页头为 Search） |
| 4 | 顶部「新建项目」按钮不在 Discuss 页内；点击打开独立创建界面；取消/返回不创建；提交成功后新项目出现在项目 Tab 并成为当前项目，Discuss 回到其需求列表；校验与空值处理保持 | PASS | 第三例：按钮位于 `.dt-project-bar` 且 `#dt-page` 内不存在；独立页无 `.dt-cards`/需求 textarea/标题输入；取消与页头返回均无 POST；提交后 `Posts[0]` body 含 `worktreeRoot`，新项目为当前 Tab、页头为项目名、请求 `local/issues?project=p-fixture`；空根省略且第二个项目 id 为 `p-fixture-2`；相对路径拒绝与停留创建页由 `panel-discuss` 用例覆盖 |
| 5 | Discuss 不再包含项目列表、内嵌创建表单、「只看/全部」链接；显示当前项目执行仓库与可选 `worktreeRoot`；无项目时顶部可创建、Discuss 提示先创建；需求详情仍显示项目 | PASS | 第一例断言 Discuss 只有「需求列表」Section、只有「新建需求」卡片、无 `.dt-select`；第三例断言无「只看这个项目/查看全部项目」；页头显示 `acme/widgets` 与 `/srv/worktrees`（截图 `after-discuss.png`）；无项目截图 `after-no-projects.png` 顶部按钮仍在、正文为「还没有项目…」；`panel-discuss` 详情用例仍断言 `项目：Widgets · acme/widgets` |
| 6 | `pnpm check`（typecheck + vitest + build）通过；新增/更新测试覆盖 Tab 切换、溢出「更多」、独立创建、Discuss 作用域 | PASS | `docs/issues/evidence/p1-check.log`：`pnpm typecheck` exit 0；63 files / 1248 tests passed；build complete；`git diff --check` 无输出；定向 6 files / 38 tests（`p1-targeted.log`） |
| 7 | PR 附同一视口/主题的 before/after 截图，baseline 为 main，after 为本分支 | PASS | `docs/evidence/p1-project-tabs/`：before 来自 deployment `main` @ `3b8c6a8` 的真实面板（1440×1100 / 900×1100，浅色，zh-CN），after 来自本分支同一场景；详见下方视觉证据与 PR 描述 |
| 8 | `docs/005-panel.md` 与 `docs/007-architecture.md` 已更新，描述项目栏、「更多」菜单与独立创建流程 | PASS | 005 新增项目栏段落并重写 Discuss/Projects；007 更新 app/provider/discuss/route 行、新增 projects 行与 panel-projects 测试行；`tests/docs.spec.ts` 11/11 |

## 测试证据

- `pnpm typecheck`：exit 0，无诊断。
- `pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/panel-panel.spec.tsx tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts`：6 files / 38 tests passed。
- `env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check`：typecheck exit 0；63 files / 1248 tests passed；build complete；exit 0。原始输出 `docs/issues/evidence/p1-check.log`，定向输出 `docs/issues/evidence/p1-targeted.log`。
- `git diff --check`：无输出。
- 实现 lane 自己的验证：typecheck 0；定向 5 files / 36 tests；全量 63 files / 1248 tests；build 0；`git diff --check` 干净。本次 worker 在加入额外断言与导航 replace 后全部复跑。

## 视觉证据

同一场景、同一视口、同一主题（浅色）、同一语言（zh-CN）；Before 为 deployment `main` @ `3b8c6a8` 的真实面板构建，After 为本分支 head 的真实面板构建。

| 场景 | Before（main @ `3b8c6a8`） | After（本分支） |
| --- | --- | --- |
| 1440×1100，Widgets + Billing 两个项目、三个需求 | `docs/evidence/p1-project-tabs/before-discuss.png`：Discuss 内项目列表 + 全量需求 + 项目筛选 | `docs/evidence/p1-project-tabs/after-discuss.png`：顶部项目 chip Tab + 当前项目页头（仓库/worktreeRoot）+ 仅当前项目需求 |
| 1440×1100，同上，新建项目入口 | `before-new-project.png`：Discuss 内嵌「新建项目」表单 | `after-new-project.png`：顶部按钮打开的独立创建页（Discuss 页无表单） |
| 900×1100，6 个长项目名 | `before-overflow.png`：Discuss 内项目行（无「更多」概念） | `after-overflow.png`：项目 Tab 行末尾出现「更多」；`after-more-menu.png`：菜单列出全部项目并标记当前；`after-more-selected.png`：选择未显示项目后 strip 滚动、页头/需求切换 |
| 1440×1100，无项目 | `before-no-projects.png`：Discuss 内嵌创建表单 | `after-no-projects.png`：顶部「新建项目」按钮仍可用，Discuss 只显示先创建提示 |
| 创建成功后（补充，无 before 对照） | — | `after-created.png`：新项目成为当前 Tab，Discuss 回到该项目的空需求列表 |

## 架构影响

- 影响面：`src/client` 的面板壳、路由记忆、项目数据轮询与 Discuss 页面，以及对应的 jsdom 测试和两篇产品文档；无 `src/app/**`、宿主 API、schema、安全/凭据或部署行为变更。
- `docs/007` 的模块表与测试表已同步 `src/client/projects.tsx` 和 `tests/panel-projects.spec.tsx`，`tests/docs.spec.ts` 通过。
- 判定：`arch_impact: local`。

## 过程记录

- 实现 lane `lane-T1-project-tabs-1` 一次完成实现、文档与测试，并报告全部验证通过；worker 复核了其 diff，补充了「切换后新建需求目标」、页面 Tab 往返、Discuss 无项目列表/无内嵌表单、worktreeRoot 可见、创建页返回不创建等断言，并把创建成功/取消/项目切换的导航改为 replace，避免历史堆栈回到无效创建页。
- 截图环境为隔离 profile `p1-before` / `p1-after`（端口 3095/3096，一次性 stateDir `/root/.dsh/state/p1-*`，系统 chromium headless），未使用线上 `superagent-test` 的真实工单或飞书内容；截图完成后已停止两个临时服务。
