# 双轴评审 · C3 执行策略 seam（Ticket `b81d294563cbe02b2f2ba0b657adfc10`）

- Run: `run-mwdmwka6-3`（execute / A1）
- Alignment: issue `q-2f92c878`，slice `C3`
- 基线: `main` @ `c68e6e44` + 依赖切片 C1 分支（PR #18）合入本分支
- 结论: **双轴 APPROVE**（无未处置 findings）

## 轴 A · Standards（是否遵循仓库既有约定）

| # | 检查项 | 结论 | 证据 |
|---|---|---|---|
| S1 | 模块边界 | PASS | 策略解析集中在新 `src/app/execution-strategy.ts`；`sessions.ts` 不再命名任何 `feature_exec_*` 工具，只读取解析结果；`prompts.ts` 只按 mode 选择文本 |
| S2 | 领域命名 | PASS | 复用 C1 的 `ExecutionMode` / `ExecutionStrategy` / `EXECUTION_STRATEGY_REVISION`，新增名称 `resolveExecutionStrategy`、`ExecutionServices`、`ResolvedExecutionStrategy`、`preRunGuard`，与 `docs/001` 的 Ticket/plan 术语一致 |
| S3 | 兼容规则有据可查 | PASS | 三处回退都在 JSDoc 写明理由：缺失 `plan.execution` → feature-exec（旧 Ticket 行为不变）、未知 version → 当前契约、缺 featureExec 服务 → native（并记录 `degraded`） |
| S4 | 内部 API 变更可控 | PASS | `composeExecute(config, mode = 'feature-exec', variables?)` 只增中间可选参数；仓库内唯一生产调用点已更新，单参调用语义由测试钉住；包导出面（`package.json` exports）未变 |
| S5 | 测试风格 | PASS | `tests/execution-strategy.spec.ts` 13 例，纯 `it`/`expect`，临时目录用后即删；无 `.only`/跳过；私有接缝用与仓库既有测试一致的显式 cast 驱动 |
| S6 | 文档表完整性 | PASS | `docs/007` Modules/Tests 各补一行，`pnpm vitest run tests/docs.spec.ts` 通过（全量 64 文件亦通过） |
| S7 | 无额外依赖/配置/迁移 | PASS | 无新依赖、无 settings schema、无 kv/schema 变更；`pnpm build` 退出码 0 |
| S8 | 提示词文件风格 | PASS | `prompts/native-execute.md` 与 `execute.md` 同结构：一句一行、段落分组、同样的交付步骤；不含任何 `feature_exec_start` |

### Findings（Standards）

- **F-1（已修）** 首版守卫只看 `strategy.preRunGuard`：若 featureExec 服务已注册、但 `feature_exec_start` 不在 worker 允许集（宿主注册不全），会装上无法解除的预运行守卫。已改为 `strategy.preRunGuard && allow.includes('feature_exec_start')`，与改动前的生效条件严格一致。
- 其余无可改项。

## 轴 B · Spec（是否满足冻结验收标准）

| 判据 | 结论 | 证据 |
|---|---|---|
| AC-1 native Ticket：允许集无任何 `feature_exec_*`、无预运行守卫、提示词无 `feature_exec_start` 且声明直接实施/不重新拆解/同样提交 PR | PASS | `tests/execution-strategy.spec.ts` — `restricts a native slice to the work tools, with no feature_exec_* tool and no pre-run guard`（allow 不含前缀项、`read`/`bash` 守卫返回 undefined）、`tells a native slice to implement the approved plan directly and deliver a PR, without naming feature-exec`（`not.toContain('feature_exec')`、含 direct implement / no decompose / Open the PR） |
| AC-2 feature-exec Ticket：工具集、守卫、提示词与改动前一致 | PASS | 同文件 `resolves a pinned feature-exec slice exactly as the legacy one`（与 legacy 解析 `toEqual`）、`keeps a feature-exec slice's tools and pre-run guard as they were`（8 个工具全在、`read`/`bash` 仍被 `feature_exec_start` 守卫拦住、`feature_exec_start` 本身放行）、`keeps a feature-exec slice on the execution handoff`；全量 64 文件 / 1301 测试通过（C1 基线 1287 + 本切片 14），`tests/prompts.spec.ts` 既有 18 例未改语义 |
| AC-3 旧 Ticket（`plan.execution` 缺失）仍按 feature-exec | PASS | 解析矩阵 `keeps a Ticket dispatched before strategies were pinned on the feature-exec flow`；真实证据：本 Ticket 的 store 记录 `plan` 仅含 `issueId/sliceId/acceptance`，无 `execution`，本 run 仍按 feature-exec 走 e1–e5，工具/守卫/提示词均与改动前一致 |
| AC-4 宿主未注册 featureExec 服务时降级 native，不出现指向 `feature_exec_start` 的提示或守卫 | PASS | `degrades feature-exec to native when the host did not register its service`（`degraded: 'featureExec-unavailable'`、tools `[]`、`preRunGuard: false`）、`keeps the legacy Ticket on feature-exec, and gives a host without the service a native worker`（allow 无前缀项、guard 返回 undefined）；提示词链路由 `strategy.mode` 决定，native 文本已断言不含 `feature_exec` |
| AC-5 目标测试与 typecheck | PASS | `pnpm vitest run tests/execution-strategy.spec.ts tests/prompts.spec.ts` → 2 文件 / 32 测试通过；`pnpm typecheck` → `tsc --noEmit` 退出 0（见 `docs/issues/evidence/`） |

### Findings（Spec）

- **F-3（按计划延后，已登记）** `docs/003-execution.md`、`docs/005-panel.md` 与 `docs/007` 的策略叙述仍以「所有 slice Ticket 都走 feature-exec」描述；这些产品文档属 C5 的冻结范围（C5 `dependsOn: [C3, C4]`）。本切片只补 `docs/007` 的 Modules/Tests 表项以满足 `docs.spec.ts`，其余叙述由 C5 在合并后统一更新。PR 描述中如实说明该限制。

## 架构影响

`arch_impact: local` —— 新增一个 app 层模块并把 `Sessions`/`Prompts` 对执行方式的判断从「有没有 plan」收敛到「解析出的策略」；不改 core 模型（C1 已提供）、不改 schema、不改 HTTP/包导出契约、不新增依赖。执行方式从此成为可版本化、可降级的单一接缝，但没有跨产品/跨进程契约变化。
