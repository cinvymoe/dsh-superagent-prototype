# C3 · 双轴评审：面板「智能体」设置页、文案与文档

- Slice: `C3`（alignment `q-b03a9391`，依赖 C1 PR #34、C2 PR #40，均已合入 `main`）
- 评审对象：`agent/slice-ce4a60f73cc5` 工作树（基线 `main` @ `1724811f`）
- 评审轴：Standards（模块边界、复用、单一来源、测试质量、文档与文案门禁）+ Spec（6 条冻结验收标准逐条对照）

## Standards

| 检查点 | 结论 | 证据 |
| --- | --- | --- |
| 面板不引入 host 代码 | 通过 | 继承口径抽到纯模块 `src/agent-model.ts`（只有 `import type`）；`lib/client.js` 中 `node:` 引用数为 0 |
| 继承语义单一来源 | 通过 | `roleModel` 由运行期与面板共用：`src/app/role-models.ts` 仅 `export { roleModel }`，`AgentsSettings` 用 `withoutOverride` 清掉当前角色覆盖后调用同一函数 |
| 设置块复用既有草稿机制 | 通过 | 页面用 `useBlockDraft('agents', …)` + `SaveBar` + `Fields`，没有自造草稿/冲突逻辑；409 走 `saveConflict` 既有文案 |
| 数据形状与保存顺序稳定 | 通过 | `disabledTools` 始终按目录 optional 顺序过滤后保存，与点击顺序无关（测试用逆序点击断言 `['web_search','skill']`） |
| 必需/可选工具的约束在 UI 与 API 两侧一致 | 通过 | 必需工具 `Switch` 原生 `disabled`（`aria-checked=true`）；fixture 的 `PUT settings/agents` 也走 `validateAgentTools`，错误映射为 `agentsRequiredTool`/`agentsUnknownTool` |
| 共享控件改动最小 | 通过 | `Switch` 只新增可选 `disabled`，既有调用不受影响；`tests/controls.spec.tsx` 与全量 `pnpm check` 通过 |
| 测试质量 | 通过 | `tests/panel-agents.spec.tsx` 9 个用例覆盖导航/路由保持、三角色与子代理说明、执行器并发与链接、继承链与恢复、工具开关与 PUT 载荷、409 草稿保留、保存栏、历史与英文界面；断言使用 `data-agent-role` 稳定钩子 |
| 文案双语对称 | 通过 | 新增 21 个 key 中英成对；`tests/locales.spec.ts` 占位符/缺失校验通过 |
| 文档与索引 | 通过 | `docs/005` Settings 行与 Agents 分组段落；`docs/007` Modules 表新增 `src/agent-model.ts`、`src/client/agents.tsx`，Tests 表登记 `tests/panel-agents.spec.tsx`；`tests/docs.spec.ts` 通过 |

观察（不阻塞）：

1. 继承行在有覆盖时仍然显示（“留空时继承 …”），让「恢复继承」旁边始终能读到清空后的实际值；这是刻意的，测试覆盖。
2. 面板测试用 fixture 注入的历史记录验证 agents 变更行渲染；真实 `settings/agents` 保存产生历史 diff 已由 C1 的 `tests/agent-config.spec.ts` 覆盖，C3 只拥有渲染侧。

Standards 结论：**pass**。

## Spec（冻结验收标准逐条）

| # | 验收标准 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 导航出现「智能体」（执行之后、提示词之前），路由刷新/返回保持；页面列出主 Session、对齐 Agent、执行器，并说明子代理继承执行器工具 | 通过 | `SETTINGS_GROUPS` 顺序被测试断言；remount 与 `at({page:'settings',query:{group:'agents'}})` 后仍为智能体；页面三卡片顺序与 `agentsIntroShort` 的子代理说明；截图 `after-settings.png`、`after-agents.png` |
| 2 | 执行器卡片显示 `running / maxWorkers`，链接跳到「执行」组，不在此处修改并发 | 通过 | 测试断言 `执行中 2 / 3`、页面无 `input[type=number]`、点击链接后 `aria-current` 为执行组且 `maxWorkers` 字段可见；截图 `after-agents-history.png` 顶部（`执行中 0 / 3` + 「在执行设置中修改并发」） |
| 3 | 模型留空显示继承实际值（主 ← 评估；对齐/执行器 ← 执行；对齐默认继承执行器覆盖），可设覆盖并一键恢复继承 | 通过 | 测试设置 eval/executor 模型后断言三卡继承行；输入执行器覆盖后对齐 Agent 立即跟随；「恢复继承」清空后保存 `main.model = null`；纯函数 `roleModel` 与运行期一致 |
| 4 | 必需工具固定勾选不可改；可选工具可开关；PUT `settings/agents` 的 `disabledTools` 正确；冲突保留草稿并显示提示 | 通过 | 测试断言必需开关 `disabled`、点击不变更草稿；可选开关产生 `['web_search','skill']` 顺序的载荷；409 后 `saveConflict` 提示且输入仍是草稿值，二次保存成功 |
| 5 | 保存栏仅改动时出现；历史能读到 agents 保存并显示角色/模型/工具变化；zh/en 齐全 | 通过 | 测试断言保存栏 0→1→0；历史渲染 `change.agentExecutorModel/agentMainTools/agentAlignerTools`；英文挂载断言 Agents/角色/必需文案；截图 `after-agents-history.png` |
| 6 | 定向测试与 `pnpm typecheck` 通过；PR 前 `pnpm check` 全绿；PR 含 Before/After 截图 | 通过 | `docs/issues/evidence/C3-agents-targeted.log`（4 files / 38 tests）、`C3-agents-typecheck.log`（exit 0）、`C3-agents-check.log`（69 files / 1424 tests + build，exit 0）；截图见 `docs/evidence/c3-agents/` 与两份 capture log |

Spec 结论：**pass**。

## 架构影响

Architecture impact: **local** —— 新增一个浏览器安全的纯模块（`src/agent-model.ts`，运行期与面板共用 `roleModel`）与一个客户面板页（`src/client/agents.tsx`），设置组顺序加一项，`Switch` 加可选 `disabled`，fixture 接受 `agents` 保存。没有 schema、迁移、公共 API、配置键或运行期语义变化；设置块语义仍由 C1/C2 拥有。

## 测试与证据

- `pnpm vitest run tests/panel-agents.spec.tsx tests/panel-settings.spec.tsx tests/locales.spec.ts tests/docs.spec.ts` — 4 files / 38 tests passed
- `pnpm typecheck` — exit 0
- `env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm check` — 69 files / 1424 tests + build，exit 0
- `git diff --check` — 无输出
- Before/After：`docs/evidence/c3-agents/{before-settings,after-settings,after-agents,after-agents-history}.png`；过程见 `docs/issues/evidence/C3-agents-capture-{before,after}.log`
