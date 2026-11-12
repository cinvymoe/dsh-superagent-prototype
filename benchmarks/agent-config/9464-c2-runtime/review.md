# C2 双轴评审与测试证据 · 运行时应用 Agent 配置：工具限制与模型覆盖

- Run: `run-mwduvyej-4`（execute，policy A1），issue `q-b03a9391:C2`
- Ticket: `9464d98fa7afacf61979a6554f28557b`
- 分支：`agent/agent-9464d98fa7af`；起点 deployment `main` @ `422a21a4`，依赖 C1 分支 `agent/agent-api-9326a1747b59`（PR #34），已合并 deployment `main` @ `72b4c4a8`（merge `410f1d0d`）
- Lane: `lane-T1-1`（subagent spawn，T2，high）；独立复核 6 条验收全 PASS，并修复 2 处边界缺陷、补 2 处断言（见「复核修复」）
- 评审日期：2026-11-13

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/app/agent-tools.ts` | 新增 `orderedTools`（目录顺序）、`turnedOff`（运行期只减 optional，宽松忽略必需/已下线名称）、`roleTools`（角色允许集） |
| `src/app/role-models.ts` | 新增 `workerRole`（`mode: 'align'` → aligner，否则 executor）与 `roleModel`（三角色继承链） |
| `src/app/sessions.ts` | 新增 `installTools`（计算后的允许集、装新滤镜再撤旧、可重入排空、首次空集也安装、释放后不再刷新）；`mainTools` / `workOnly` 改走同一刷新路径；`workOnly` 按角色与计划策略计算；`limitSubagent` 共享绑定；`agentsChanged`；`ensure` / `answer` 改用 `roleModel` |
| `src/app/settings.ts` | `SettingsHost.sessions` 增加 `agentsChanged`；保存 `agents` 块后调用一次（`src/app/settings.ts:207`），不改 `policyVersion`、不重启 |
| `docs/003-execution.md` | 新增「The Agent configuration」小节：三角色、必需/自动工具、下一步生效、模型继承与新 Session 限制 |
| `docs/007-architecture.md` | Sessions 小节增加运行期刷新与模型解析说明；Modules 表 `role-models.ts` / `agent-tools.ts` 与 Tests 表相应行更新；主 Session 工具段落与 worker 工具段落更新 |
| `tests/agent-config.spec.ts` | 新增 3 个用例：`roleTools` 顺序与宽松忽略、`roleModel` 继承链、对齐 Session 使用 aligner 集与 aligner 模型（含 executor 对照） |
| `tests/runtime.spec.ts` | 新增 3 个用例：保存后主 Session / 运行中执行器 / 子代理 / 新执行器的允许集刷新与非 agents 保存不刷新；压缩工具与 `read_image` 组合；模型覆盖只进新 Session |
| `tests/execution-strategy.spec.ts` | helper 补 `settings` 与 binding；新增「executor 关可选工具时切片 `feature_exec_*` 仍在」「空允许集也安装限制」 |
| `docs/issues/evidence/c2-agents-*.log` | 针对性、类型、全量三条命令的日志（含 exit code） |

## Standards 轴

结论：**通过（approve）**。

- **单一目录来源**：`MAIN_TOOLS` / `WORK_TOOLS` / `COMPRESSION_TOOLS` / preset 常量仍只在 `src/app/agent-tools.ts`；运行期允许集由 `roleTools` 基于同一份目录计算（`src/app/agent-tools.ts:46-62`），没有第二份工具列表。目录外的自动工具（压缩、`feature_exec_*`）不进入目录，因此保存 `agents` 无法关闭它们。
- **刷新顺序与可重入性**：`installTools`（`src/app/sessions.ts:331`）保留原有不变式——先安装新滤镜再撤旧滤镜（滤镜取交集，先撤会短暂放开）；安装/撤销触发的 `tools/change` 在本次调用内排空，不丢更新；重建失败保留旧滤镜并记录警告，只有首次安装失败会让装饰失败。
- **首次安装与释放边界**：`current` 以 `undefined` 表示「尚未安装」，空允许集也会调用 `restrict([])`（修复前会跳过，等于不限制）；`disposed` 标志保证释放后晚到的 `tools/change` 不会复活滤镜（`src/app/sessions.ts:331-373`）。
- **读取宽松、保存严格不破**：运行期 `turnedOff` 只认当前 optional 集的成员（`src/app/agent-tools.ts:53-56`），存量目录外名称与必需工具名都被忽略；C1 的 panel-only、必需工具、未知工具、模型可用性校验保持不变（`tests/agent-config.spec.ts:133`）。
- **作用域清晰**：`sessions.ts` 只负责把配置映射到 DSH 注册（工具滤镜、模型注入、技能/提示），不写 Store、不改 `policyVersion`；`settings.ts` 只在保存 `agents` 后触发一次刷新；`role-models.ts`、`agent-tools.ts` 均为纯函数，测试直接覆盖，无对 Engine/Store 的反向依赖。
- **模型语义**：`roleModel` 的继承链集中在一处（`src/app/role-models.ts:17`）；`initializeRoleModel` 的新 Session 守卫未改（有 request header 或 model/selection 即不再注入），因此「只对新 Session 生效」由既有机制保证，而不是在每个调用点各写一次。
- **测试质量**：断言面向可观察结果（假宿主记录的 `restrict` allow 列表、`model/selection` 事件、`resolveCallConfig` 入参、HTTP 响应），不绑定内部实现；无定时器、无网络、无随机；既有精确 allow 断言（`tests/runtime.spec.ts:1617-1623`）作为回归对照保留。
- **文档与差异卫生**：`tests/docs.spec.ts` 的编号链接、Modules/Tests 表明细通过；本切片改动文件的 `git diff --check` 无输出（全分支 diff 仅剩 C1/其它 slice 已提交证据日志里的既有尾随空格，不是本切片引入）。

## Spec 轴（逐条对照冻结验收标准）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 关闭执行器可选工具（如 `web_search`）后：新建执行器 Session 看不到它；保存后已在运行的执行器及其子代理在下一步失去它；必需工具仍在 | PASS | `src/app/sessions.ts:409` 用 `roleTools(workerRole(now), settings().agents)` 计算；`src/app/settings.ts:207` 保存后 `agentsChanged`；`src/app/sessions.ts:376` 遍历 binding。`tests/runtime.spec.ts:1672-1699`：运行中 worker 与已存在 child-1 的最新 allow 去掉 `web_search`、保留 `bash/read/grep`，保存后新建执行器首条 allow 即不含 `web_search`；非 agents 保存不重装 |
| 2 | 主 Session 关闭 `read_image` 后下一步生效；存在压缩工具时仍自动保留 | PASS | `src/app/sessions.ts:320` 追加压缩工具；`tests/runtime.spec.ts:1701-1709`：先注册压缩工具得到 `MAIN_TOOLS + COMPRESSION_TOOLS`，保存 `main.disabledTools=['read_image']` 后 allow = 去掉 `read_image` 的 `MAIN_TOOLS` + 压缩工具；`tests/runtime.spec.ts:1636-1668` 仍覆盖迟注册压缩工具与安装/撤销顺序 |
| 3 | 计划切片工单仍自动获得 `feature_exec_*`；对齐 Agent 使用对齐自己的可选集 | PASS | `src/app/sessions.ts:409-416` 把 `strategyOf(now).tools` 追加在目录结果之后；`tests/execution-strategy.spec.ts:106-114`：executor 关 `web_search/read_image` 时 allow 仍含全部 `FEATURE_EXEC`、含 `bash`、不含被关项；`tests/agent-config.spec.ts:72-95`：aligner 关 `read_image` 后对齐 Session 的 allow 不含它、executor 的 allow 仍含它 |
| 4 | 模型覆盖按定义生效：主 Session←`agents.main` ?? 评估模型；执行器←`agents.executor` ?? 执行模型；对齐←`agents.aligner` ?? 执行器有效模型。只对新 Session 生效，已运行 Session 保持原模型 | PASS | `src/app/role-models.ts:17-23`；`src/app/sessions.ts:151`（ensure）、`:172`（answer）。`tests/agent-config.spec.ts:54-70` 覆盖空配置、三角色 override、aligner 继承 executor override 与默认；`:72-95` 断言 aligner 新 Session 以 override 调 `resolveCallConfig`；`tests/runtime.spec.ts:1712-1733` 断言保存后已运行 main/worker 无新 `model/selection`，保存后新执行器取 executor override，重启后的 main Session 取 main override |
| 5 | 没有 `agents` 配置时，三类 Session 的工具与模型与现在完全一致（回归对照） | PASS | `tests/agent-config.spec.ts:40-52`：空配置下 `roleTools` 精确等于 `MAIN_TOOLS` / `WORK_TOOLS`，`roleModel` 回落 `eval.model` / `executor.model`；既有 runtime 精确 allow 断言未改并通过；`tests/role-models.spec.ts` 5 例全部通过 |
| 6 | 指定测试与 `pnpm typecheck` 通过；PR 前 `pnpm check` 全绿；`docs/003`、`docs/007` 已更新 | PASS | 见下「测试证据」：111 tests + typecheck exit 0 + 68 files / 1400 tests + build exit 0；`docs/003` 新小节，`docs/007` Sessions/Modules/Tests 行 |

## 测试证据

- 定向（冻结命令，干净 env）：`pnpm vitest run tests/agent-config.spec.ts tests/runtime.spec.ts tests/role-models.spec.ts` → **3 files / 111 tests passed**，exit 0（`c2-agents-targeted.log`）。
- 扩展定向（复核 lane 额外）：加上 `tests/execution-strategy.spec.ts` → 4 files / **126 tests passed**，exit 0。
- 类型：`pnpm typecheck` → exit 0（`c2-agents-typecheck.log`）。
- 全量（合并 deployment main 后的最终代码）：`pnpm check` → typecheck + **68 files / 1400 tests passed** + tsdown build 成功，exit 0（`c2-agents-check.log`）。
- 宿主环境说明：worker shell 注入 `GIT_CONFIG_GLOBAL` / `LANG=zh_CN` 会让既有 2 个用例失败；以上命令均在 `env -u … LANG=C.UTF-8 LC_ALL=C.UTF-8` 下执行（见 `environment.md`）。
- `git diff --check`：本切片新增/修改文件无输出；全分支剩余项来自 C1 与其它 slice 已提交的证据日志。

## 复核修复（lane T1）

1. `installTools` 首次安装空允许集：`current` 从 `[]` 改为 `string[] | undefined`，空集也安装 `restrict([])`，避免「没有工具可用」退化为「不限制」（`src/app/sessions.ts:333-350`；回归 `tests/execution-strategy.spec.ts:122`）。
2. `installTools` 释放后刷新：新增 `disposed`，`refresh` 入口直接返回、排空条件带 `!disposed`，disposer 先置位再清 `binding.tools`（`src/app/sessions.ts:337-372`）。
3. 补充断言：非 `agents` 块保存不重装工具（`tests/runtime.spec.ts:1694-1697`）；空允许集用例（`tests/execution-strategy.spec.ts:122`）。

## 已知限制

- `limitSubagent` 先登记 binding 再计算 `workOnly`；若首次 `restrict` 抛错会留下一个无 `tools` 的空 binding。评估：失败时子代理本就不受限（与旧行为一致）、无重试入口、`release` 会清理，故不改，作为后续 clean-up 候选。
- Q&A answer Session（fork）使用 executor 角色的有效模型；这是任务契约声明的 `answer` 行为，不是第四个角色，C3 的面板口径需知悉。
- 本 PR 携带 C1 的 `agents` 数据模型/校验/API 提交（C2 依赖，PR #34）；C1 先合入后本 PR 的 diff 会自动收敛到运行期改动。
- 无 UI 改动，不含 Before/After 截图；「智能体」面板页由 C3 交付。
