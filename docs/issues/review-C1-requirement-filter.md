# C1 评审与测试证据 · 需求列表按处理情况筛选，默认待处理

- Run: `run-mwdo34je-5`（execute，policy A1），issue `q-ebb66317:C1`
- Ticket: `8e433136ac138a0e8a62fa57cb94a6b4`
- 分支：`agent/slice-8e433136ac13`；实现基线 `c68e6e44`（ticket 起点），截图前依次合入 `main` `6ed5fde`（PR #18）与 `40191e32`（PR #20/#21），Before = 合并目标 main `40191e32`
- 实现 lane：`lane-C1-filter-1`（subagent `c0f2f3f7-5c7e-42f4-8615-8628150de545`，T2 / high），一次完成实现与定向验证；worker 复核后补英文文案断言、合并 main、跑全量与截图
- 评审日期：2026-11-12

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/client/route.ts` | 新增 `REQUIREMENT_FILTERS = ['pending','confirmed','closed','all']` 与 `RequirementFilter`；需求列表与详情的路由变体带 `query?: { filter?: RequirementFilter }`（新建/编辑项目仍无 query）；`parseRoute` 接受并规整 `query.filter`：未知值丢弃、`pending` 为默认且不写入 query，旧 `discuss` 路由继续映射 |
| `src/client/app.tsx` | 列表与详情都收到 `filter={route.query?.filter ?? 'pending'}` |
| `src/client/discuss.tsx` | `RequirementList({filter})`：客户端按桶过滤（closed 按 state；confirmed = 开放且对齐已确认；pending = 开放且无对齐/已提议/已打回；all = 当前项目全部），保留宿主的新到旧顺序；`.dt-filters` 内按固定顺序渲染 `Pill`（`aria-pressed`），点击 `pending` 写 `{page:'requirements'}`、其余写 `query.filter`，均 `replace`；Section 计数 = 显示条数；无需求保留 `discuss.empty`，有需求但当前桶为空显示新增 `discuss.emptyFilter`；行标题打开详情时携带当前筛选；`RequirementDetail({id, filter})` 仅把返回按钮改为回到同一筛选的列表（`replace`），其余行为不变 |
| `src/client/projects.tsx` | 需求列表根页切换项目时保留筛选（`pending` 仍不写 query），`replace` 更新，其他页签与项目编辑页保持原落点 |
| `src/client/locales.ts` | 新增 `requirementFilter.pending/confirmed/closed/all`（待处理/已确认/已关闭/全部）与 `discuss.emptyFilter`；既有 `discuss.pending`（待对齐）标签未改 |
| `tests/panel-discuss.spec.tsx` | 更新“newest first”用例为新默认（已关闭行隐藏）：pill 顺序/标签、默认 `aria-pressed` 与 Section 计数、`已关闭`/`全部` 子集与顺序、经 `sessionStorage['dsh-superagent/route']` 断言 replace 且 `pending` 不写 query；新增“非默认筛选打开详情再返回保持筛选”、筛选空态 vs 完全无需求空态、英文 pill 与英文筛选空态 |
| `tests/panel-projects.spec.tsx` | 项目切换用例改为从 `filter=confirmed` 开始：切换后 pill 仍为已确认、重新请求 `local/issues?project=p-other`、只显示新项目的已确认行、路由保留 `query.filter` |
| `tests/navigation.spec.ts` | `parseRoute` 需求列表/详情筛选：合法值、未知值、`pending` 规整、旧 `discuss` 列表/详情带筛选、新建/编辑页丢弃筛选 |
| `docs/005-panel.md` | Requirements 行写明四种筛选与顺序、默认待处理定义、已确认/已关闭/全部含义、replace 语义、详情返回与项目切换保留筛选 |
| `docs/evidence/c1-requirement-filter/` | 同场景、同视口、同主题、同一份种子数据的 Before/After 真实面板截图 |

范围外且未改动：服务端分页/服务端筛选、需求状态机与对齐语义、详情页与新建需求页的内容/交互、其它面板页面、`docs/007-architecture.md`（未新增模块或测试文件，模块/测试表仍有效）。没有新增模块或测试文件。

## 双轴评审

### Standards 轴

结论：**通过（approve）**。

- **模块边界**：筛选类型与路由 query 留在 `route.ts`；桶判定与渲染留在 `discuss.tsx` 单一位置；项目切换的保留规则留在 `projects.tsx`；文案在 `locales.ts`。没有引入第二套需求数据源或服务端接口。
- **数据流**：列表仍用既有 `GET local/issues?project=` 一次取数，客户端只做隐藏行；不新增请求参数，旧服务端与旧客户端组合仍可用（旧客户端忽略 query）。
- **路由语义**：`pending` 是默认且规范化，路由记忆不会写入冗余 query；`replace` 与其它筛选页（Trigger/Eval/Execution）的既有约定一致；详情路由携带筛选只为返回目标，详情的取数与展示不变；`parseRoute` 丢弃未知值与新建/编辑页的 query，旧 `discuss` 深链兼容。
- **类型安全**：`Route` 联合按变体收窄，`app.tsx` 与 `projects.tsx` 都显式分支（不靠 spread 拼 union）；`tsc --noEmit` exit 0。
- **可访问性**：复用 `Pill`（`aria-pressed`），当前桶可被辅助技术识别；键盘可达（原生 button）。
- **命名**：`REQUIREMENT_FILTERS` / `RequirementFilter` / `requirementBucket` 与既有 `THREAD_FILTERS` / `TICKET_FILTERS` 一致；四个桶名与文案一一对应。
- **测试质量**：断言落在 DOM（pill 的 `aria-pressed`、Section 计数、行标题顺序）与持久化的路由记忆（sessionStorage），不只看组件返回值；中英文均断言；空态两种分支分开断言；无网络、无时钟依赖。
- **风格**：2 空格、无分号、单引号；改动集中在既有函数，未做无关格式化。

### Spec 轴（冻结验收标准逐条）

| AC | 判据 | 证据 | 结论 |
| --- | --- | --- | --- |
| AC1 | 无路由筛选时只显示开放且对齐缺失、已提议或已打回的需求；已确认/已关闭不出现；待处理 pill `aria-pressed=true`；Section 计数 = 显示条数 | `panel-discuss`：“lists the current project requirements newest first…” 断言默认 pill 序列 `[待处理,已确认,已关闭,全部]`、`aria-pressed=[true,false,false,false]`、行只有 proposed 的一条、`.dt-count=1`；截图 `after-default.png`（计数 3）；对照 `before-default.png`（基线 5 条、无筛选行） | PASS |
| AC2 | 筛选行顺序与中英文正确；点击后 replace 更新路由（待处理不写 filter query）；只显示该桶且新到旧；全部显示当前项目所有需求 | 同一用例断言 pill 顺序与点击 `全部`/`已关闭`/`待处理` 后的行集合、顺序与 `sessionStorage` 路由（`query.filter` 与 stack 不增长，pending 无 query）；英文用例断言 en 四枚 pill 标签；`navigation.spec` 断言 `parseRoute` 的合法/未知/`pending` 规整 | PASS |
| AC3 | 非默认筛选打开详情再返回保持筛选；在列表页切换项目保持筛选并按新项目重新取数 | `panel-discuss`：“keeps a non-default filter when a requirement detail returns to the list” 断言详情路由带 `query.filter`、返回后 pill 与行不变、路由仍为 `{page:'requirements',query:{filter:'confirmed'}}`；`panel-projects`：“keeps the requirement list when switching projects there…” 断言切换后 `已确认` pill 保持、请求 `local/issues?project=p-other`、只显示新项目行；截图 `after-closed.png` / `after-closed-back.png`、`after-switched-project.png` | PASS |
| AC4 | 有需求但当前筛选为空显示新空态；完全没有需求保留原空态；详情页与新建需求页行为不变 | `panel-discuss`：“shows the filtered empty copy…”（仅已关闭时默认桶显示 `emptyFilter` 且不含 `empty`；清空后显示 `empty` 且不含 `emptyFilter`）；既有“returns from a requirement detail…”“opens a saved Discuss route…”“New requirement…”用例全部通过；详情仅新增返回目标，新建页未改 | PASS |
| AC5 | `pnpm typecheck`、`pnpm test`（含更新后的 panel-discuss/panel-projects/navigation 与 locales 文案校验）、`pnpm build` 通过；`pnpm check` exit 0 | 定向 6 files / 61 tests（`evidence/c1-requirement-filter-targeted.log`）；全量 `pnpm check` = typecheck + 63 files / 1298 tests + Build complete，exit 0（合入 main `40191e32` 后复跑）（`evidence/c1-requirement-filter-check.log`） | PASS |
| AC6 | `docs/005-panel.md` Requirements 行写明四种筛选与默认待处理；未新增模块或测试文件；007 架构表不变 | `docs/005-panel.md` diff；`git status` 只有既有文件修改 + 新增证据/评审/基准文档；`docs.spec.ts` 的模块/测试表校验在未改 007 的前提下通过 | PASS |
| AC7 | PR 描述含同视口、同主题、同一份种子数据的 Before/After 截图并标注基线与被改 head：默认列表、非默认筛选、详情返回后筛选保留 | `docs/evidence/c1-requirement-filter/`：`before-default.png`/`after-default.png`、`before-default.png`（基线无筛选行）/`after-closed.png`、`before-detail-back.png`/`after-closed-back.png`；Before = main `40191e32` 真实面板，After = 本分支 head 真实面板；1440×1100、浅色、zh-CN、同一份 SQLite 种子（2 项目 / 7 需求）；PR 描述逐对标注 | PASS |

### 评审发现与处置

| # | 发现 | 处置 |
| --- | --- | --- |
| F-1 | 实现 lane 的定向用例只断言了中文 pill 文案，冻结标准要求中英文正确 | worker 在 `tests/panel-discuss.spec.tsx` 补 “names the requirement filters and the filtered empty copy in English as well”，并重跑定向与全量 |
| F-2 | 实现分支基于旧 main（`c68e6e44`），交付时 main 已前进到 `6ed5fde`，随后又到 `40191e32`（PR #20/#21） | 先提交切片，再依次 `git merge --no-edit FETCH_HEAD` 合入 main（第二次仅 `docs/issues/benchmark` 符号链接冲突，保留本切片目标；其余自动合并），在最终合并树上重跑 `pnpm check`、重建并重截 Before/After，使两侧只差本切片 |
| F-3 | 默认桶在首屏取数完成前会短暂显示 0 条与“还没有需求”以外的状态（既有 `data`-gated 空态逻辑） | 不改既有取数/空态时序；截图脚本改为等待列表/筛选行渲染后再截取，证据日志中最终状态一致（`after-default` 计数 3） |

无未处置的评审意见；无范围蔓延。

## 架构影响

- `arch_impact: local`。改动集中在面板客户端（路由 query、列表渲染、项目切换）与既有测试/文档，没有新增模块文件、没有服务端 API/schema 变更、没有跨产品共享契约。
- 未新增模块或测试文件，`docs/007-architecture.md` 的模块与测试表保持有效（`tests/docs.spec.ts` 通过）。
- 产品文档只更新 `docs/005-panel.md`；`docs/007` 不改写。

## 测试证据

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm vitest run tests/panel-discuss.spec.tsx tests/panel-projects.spec.tsx tests/navigation.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts`（合入 main `40191e32` 后） | 6 files / 61 tests passed，exit 0 | `evidence/c1-requirement-filter-targeted.log` |
| `env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check`（合入 main `40191e32` 后） | typecheck + 63 files / 1298 tests passed + Build complete，exit 0 | `evidence/c1-requirement-filter-check.log` |
| `git diff --check` | 干净 | 本记录 |

**已知环境限制**：宿主 worker 环境导出 `GIT_CONFIG_GLOBAL` 与 git 本地化错误信息，会让 `tests/environment.spec.ts` / `tests/runtime.spec.ts` 的少数断言失败（与既有回归案例 `benchmarks/project-repo-chains/c2-project-chains/environment.md` 记录一致）；按上面的 `env -u ... LC_ALL=C` 清理后全量全绿，与本切片无关。实现 lane 报告的三例失败即属此类，最终全量证据即清理后的运行。

## 视觉证据

同一场景（项目 `Widgets` + `Billing`；`Widgets` 下 5 条需求：无对齐/已提议/已打回/已确认/已关闭，`Billing` 下 2 条），同一视口 1440×1100、浅色、zh-CN、同一份 SQLite 种子数据，真实 DSH 面板构建（系统 chromium headless / Playwright）。

- **Before** = `cinvymoe/dsh-superagent-prototype` main `40191e3261aa003c790032548c60f0597f57d228`（PR 的合并目标）
- **After** = 本分支 head（见 PR 记录）

| 场景 | 文件 |
| --- | --- |
| 默认列表（Before 全部 5 条；After 仅待处理 3 条 + 筛选行） | `docs/evidence/c1-requirement-filter/before-default.png` / `after-default.png` |
| 非默认筛选（Before 无筛选行，只能显示全部；After 已关闭 1 条） | `before-default.png` / `after-closed.png` |
| 详情返回后筛选保留（Before 返回全部列表；After 返回已关闭筛选列表） | `before-detail-back.png` / `after-closed-back.png` |
| 附加：详情页、切换项目保持筛选、全部 | `after-detail.png`、`after-switched-project.png`、`after-all.png`、`after-all-widgets.png` |

截图来自隔离 profile `c1req-before` / `c1req-after`（端口 3121/3122，一次性 stateDir `/root/.dsh/state/c1req-*`，SQLite 直接种子），未使用线上 `superagent-test` 的真实工单或飞书内容。

## 待复核清单

- 目视项：筛选行的间距与 pill 激活样式沿用既有 `.dt-filters` / `Pill`，已在真实面板截图确认；主观排版偏好由 owner 在 PR 复核。
- 无真机、无跨架构、无性能项。
