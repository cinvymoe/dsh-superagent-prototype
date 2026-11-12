# C1 评审与测试证据 · 核心：Ticket 执行策略字段与派发固定

- Run: `run-mwdm5xtw-1`（execute，policy A1），issue `q-2f92c878:C1`
- Ticket: `a6e2430d5e8f05448428a7c6a18a71af`
- 分支：`agent/ticket-a6e2430d5e8f`，基线 `95a597cb`（deployment `main`）
- 实现：e2 先派 `lane-T1-1` / `lane-T1-2`（subagent spawn），两次都在产生任何改动前静默失败（`git status` 只有切片文档）；run 内按兜底由 worker 在 ticket worktree 直接实现，范围未扩大。详见 issue「e2 dispatch」证据。
- 评审日期：2026-11-12

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/core/model.ts` | 新增 `ExecutionMode`（`native` \| `feature-exec`）、`EXECUTION_STRATEGY_REVISION = 'execution-v1'`、`ExecutionStrategy = { mode, version }`、`DEFAULT_EXECUTION_STRATEGY = { mode: 'native', version: 'execution-v1' }`；`Ticket.plan` 增加可选 `execution`，注明派发时固定、重复确认不改写 |
| `src/core/ports.ts` | `AssessmentOutcome` 的 accept `plan` 字段带出可选 `execution: ExecutionStrategy`，由 `Tickets.create` 原样保存 |
| `src/core/evals.ts` | `acceptPlan` 输入增加可选 `execution`；新建 slice Ticket 固定 `plan.execution = input.execution ?? DEFAULT_EXECUTION_STRATEGY`；复用既有 Ticket 的路径不改写其 pinned 策略；JSDoc 同步 |
| `src/core/engine.ts` | `Engine.acceptPlan` 输入同步透传 `execution`，JSDoc 说明每个 Ticket 固定其派发时的策略 |
| `tests/core-engine.spec.ts` | `plan dispatch` 组：缺省固定 native（既有建单测试的深比较）、显式 feature-exec 固定到每个新 Ticket、显式 native 固定、重复确认（native → feature-exec）复用同一 Ticket 且保留首次 pinned 模式 |

范围外且未改动：`src/app/**`（需求侧 API/派发传递）、`src/client/**`（面板）、`prompts/**`、执行策略注册表与 Session/提示词解耦、旧 Ticket 兼容解析、`docs/003`/`docs/005`/`docs/007` 产品文档。这些属于同一 alignment 的 C2–C5。

## 双轴评审

### Standards 轴

结论：**通过（approve）**。

- **模块边界**：契约只落在 core（`model`/`ports`/`evals`/`engine`）；没有向 `src/app` 泄漏"读需求记录/选策略"的知识，也没有引入第二套策略表示。执行策略的解析留给后续切片的注册表。
- **命名与既有概念**：`Execution` 已表示 Ticket 的执行环境（name/directory/assignment），新增记录命名为 `ExecutionStrategy`，二者不混淆；`Ticket.plan.execution` 与 `Ticket.execution` 命名空间不同（一个在 plan 内），访问路径明确。
- **持久化兼容**：`plan` 是 Ticket JSON 的一部分，schema 11 的存储形状不变，不需要迁移；新字段可缺省，旧记录自然缺省，符合 C3"旧 Ticket 按 feature-exec 兼容解析"的前提。
- **默认值语义**：`DEFAULT_EXECUTION_STRATEGY` 是派发缺省，不是读取缺省；本切片没有读取方，因此不改变任何运行行为（C3 才消费）。显式传入优先于缺省。
- **幂等与不变性**：复用路径先命中 `existing` 直接 push，未触碰 `plan`；与既有"重复确认幂等"实现一致，没有另设改写分支。
- **测试质量**：断言落在持久化后的 Ticket（`repo.tickets.get`），不只看返回值；覆盖缺省、显式两种模式、重复确认不改写；无网络、无时钟依赖；命名描述行为而非实现。
- **风格**：2 空格、无分号、单引号；JSDoc 与相邻声明同风格；diff 无无关格式化。

### Spec 轴（冻结验收标准逐条）

| AC | 判据 | 证据 | 结论 |
| --- | --- | --- | --- |
| AC1 | `acceptPlan` 传入 `{mode:'native', version:'execution-v1'}` 时，每个新建 slice Ticket 的 `plan.execution` 与之一致 | `pins an explicitly passed native strategy instead of relying on the default`；`reuses...` 首轮显式 native 并断言 `second[0].plan.execution` 仍为 native（`evidence/c1-execution-strategy-targeted.log`，119 passed） | PASS |
| AC2 | 未传 execution 时，新建 Ticket 固定为 `{mode:'native', version:'execution-v1'}` | `creates one execution ticket per confirmed slice...` 对两个新 Ticket 的 `plan` 做深比较，包含该字面量 | PASS |
| AC3 | 同一 issue 重复确认复用既有 Ticket，且不改变其已固定的模式 | `reuses the tickets a repeated confirmation would dispatch again and keeps the strategy each pinned`：先 native 后 feature-exec，id 相同、库存记录仍为 native、`executor.start` 仅一次 | PASS |
| AC4 | `pnpm vitest run tests/core-engine.spec.ts` 与 `pnpm typecheck` 通过 | `evidence/c1-execution-strategy-targeted.log`（119 passed）、`evidence/c1-execution-strategy-typecheck.log`（tsc exit 0） | PASS |

显式传入 `feature-exec` 的固定也由 `pins the execution strategy a confirmation passes to every slice ticket it creates` 覆盖（返回值与库存记录双向断言），说明策略字段不是 native 专用分支。

### 评审发现与处置

| # | 发现 | 处置 |
| --- | --- | --- |
| F-1 | 显式传入 native 时只被"重复确认"用例间接覆盖，AC1 的单点证据不够直观 | 新增 `pins an explicitly passed native strategy instead of relying on the default` |
| F-2 | 新用例 `second[0]` / `first[0]` 在 `noUncheckedIndexedAccess` 下报 TS2532 | 补非空断言，`pnpm typecheck` 恢复 exit 0 |

无未处置的评审意见；无范围蔓延。

## 架构影响

- `arch_impact: local`。改动集中在 core 的模型/端口/派发实现，没有新增模块文件、没有跨产品共享契约、没有 schema 变更。
- 本仓库没有 `docs/architecture/` 与 `arch_impact.py`/`arch_check.py`（与 s5 skill 的通用资产不同），架构记录即 `docs/007-architecture.md`。本切片没有新增模块/测试文件，`docs/007` 的模块与测试表无需变化；执行策略语义、开关与策略版本解耦的文档由同 alignment 的 **C5** 统一写入 `docs/003`/`docs/005`/`docs/007`，本切片按冻结范围不写产品文档（deferred，原因：文档切片 C5 负责，避免重复/冲突）。

## 测试证据

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm vitest run tests/core-engine.spec.ts` | 1 file / 119 tests passed | `evidence/c1-execution-strategy-targeted.log` |
| `pnpm typecheck` | exit 0 | `evidence/c1-execution-strategy-typecheck.log` |
| `pnpm test`（干净 git 环境） | 63 files / 1287 tests passed | `evidence/c1-execution-strategy-full.log` |
| `pnpm test`（宿主 worker 环境，未清理 `GIT_*`） | 1284 passed / 3 failed | `evidence/c1-execution-strategy-full-host-env.log` |

**已知环境限制**：直接在 worker 宿主环境跑全量时，`tests/environment.spec.ts`（git 配置报错为中文）与 `tests/runtime.spec.ts`（宿主注入的 worker PATH/`GIT_*`）会有 3 个用例失败；在**未改动的基线 HEAD**（`git archive HEAD` 到 `/tmp/c1-base`）复跑同样 3 个用例得到完全相同的失败（`evidence/c1-execution-strategy-baseline-failures.log`），确认与本切片无关。按既有回归案例 `benchmarks/project-repo-chains/c2-project-chains/environment.md` 的清理方式（`env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME ... LC_ALL=C`）跑全量即全绿。

## 待复核清单

本切片无目视/真机/主观验收项（纯核心模型与单测），无可观感待复核项。C4 的面板开关会带来可见交互，由该切片自证。
