---
arch_impact: local
pr_status: open
pr_url: https://github.com/cinvymoe/dsh-superagent-prototype/pull/11
pr_arch_impact: local
worktrees: []
---

# C1 · 删除旧版单链路：GitHub Source 只保留显式仓库链路

- Alignment issue: `q-141a6a1e`（Discuss 面板已确认对齐，dispatch 出本 slice `C1`）
- Slice: `C1`（本次执行；同一计划的其他 slice 由各自 ticket 执行，不在本次范围）
- Source trigger: `ca586e78ff99c152e30518b3533b6bb9`（`local:q-141a6a1e`）
- Batch trigger: `ea21f31f4177d613717f07b27e92c9af`（「pr 合并后 本地也需要生效」）
- Flow: execute / scope: shared / product: shared / policy: A1
- Ticket: `e98e00c734ae15fdffa3950e7bbbda0a`
- 分支：`agent/github-source-e98e00c734ae`，基线 `04cb0449`（deployment `main`）

## 需求原文

> 1我当前项目superagent 修改 接收Issue的仓库 执行代码的仓库 ，rust_crane 也跟着修改了。没有隔离。我的想法是 每个项目独立。
> 2旧版单链路 删除
>
> 仓库链路(一个 Issue 仓库 → 一个执行仓库)
> 接收Issue的仓库(旧版单链路)
> cinvymoe/dsh-superagent-prototype
> 执行代码的仓库(旧版单链路)
> cinvymoe/dsh-superagent-prototype

本 slice 只承接第 2 点：**删除 GitHub Source 的旧版单链路回退**，让仓库链路（chains）成为唯一配置。
「每个项目独立」以及修改仓库时影响 `rust_crane` 的隔离问题由同一计划的其他 slice 承接，不属于本 ticket 范围。

## 现状与问题

- `GithubConfigSchema` 仍带 `repository` / `intakeRepository` / `codeRepository` 三个旧版单链路字段；`chains` 为空时 `githubChains()` 回退到它们，`resolveDeployment()` 也随之把旧字段当成一条 `default` 链路。
- Source 设置卡同时渲染「仓库链路」rows 和「接收 Issue 的仓库（旧版单链路）」「执行代码的仓库（旧版单链路）」「旧版仓库（兼容）」三个字段。用户看到两套入口，实际生效的是回退逻辑，容易两处不一致。
- 需求明确要求删除旧版单链路：面板只保留链路行，配置与 setup 只认显式 `chains`。

## 冻结验收标准（来自 assignment）

- `GithubConfigSchema` 只接受 `{cli, chains: [{id, intakeRepository, codeRepository}], ...}`；`chains` 为空时 setup 返回 `repositoryUnset`，不再回退到 `repository`。
- 旧形状 `{repository, intakeRepository, codeRepository}` 的已存配置可被读取归一化为 `id=default` 的链路；从面板保存一次后，存储配置只含 `chains`，不再含旧字段。
- Source 设置卡不再出现「旧版单链路」和「旧版仓库（兼容）」字段；链路行可新增/编辑，缺少 `id` 或 `codeRepository` 的链路被拒绝。
- 相关定向测试更新并通过；`pnpm check` 全绿。
- `docs/003` 与 `docs/006` 不再描述旧版单链路回退，并写明显式 `chains` 为必需配置。

## 实现方案

1. **配置 schema（`src/deployment.ts`）**
   - `GithubConfigSchema` 改为严格对象，只含 `cli`、`chains`（`GithubChainSchema[]`，默认 `[]`）、`pollSeconds`、`failuresBeforeError`、`observe*`。删除 `GithubAccountsSchema` 与旧字段；`GithubChainSchema` 的 `id` 与 `codeRepository` 改为必填（`id` 为 lowercase-kebab-case，`codeRepository` 为 `owner/name`），`intakeRepository` 可空并在解析期回退到 `codeRepository`。
   - 新增 `normalizeGithubConfig(stored)`：读取已存配置时把旧形状（无 `chains`、有 `repository`/`intakeRepository`/`codeRepository`）归一化为 `[{id: 'default', intakeRepository, codeRepository: codeRepository || repository}]`，并丢弃旧字段；`chains` 存在（即使为空数组）时不再回退。用它替换 `githubChains()` 的旧版回退；空 `chains` 由 `resolveDeployment()` 抛 `SetupError('repositoryUnset')`。
   - 读取归一化的接入点：GitHub Source 通过 `SourceKind` 的存储读取钩子（`SourceRegistry.resolve`）拿到归一化配置（面板 GET settings 与运行时轮询都经此）；`resolveDeployment()` 对传入的已存配置同样先用 `normalizeGithubConfig()`。面板保存走严格的 `GithubConfigSchema`，因此保存后的存储配置只含 `chains`。
2. **面板字段（`src/sources/github.ts`）**：删除三个旧版字段；链路 rows 的 `id`、`codeRepository` 必填（`intakeRepository` 可选，留空即用同一个执行仓库），并更新 hint。
3. **setup 变化检测（`src/app/setup.ts`）**：`SETUP_FIELDS.github` 收敛为 `['chains', 'cli']`。
4. **测试**：更新 `tests/deployment.spec.ts`（旧字段回退用例改为链路必填、旧形状读取归一化、空 `chains` → `repositoryUnset`）、`tests/panel-source.spec.tsx`（字段清单与链路行增删）、`tests/fixtures/panel-server.ts` 与 `tests/runtime.spec.ts`/`tests/model-surface.spec.ts`（默认配置改为 chains 形状）、`tests/sources.spec.ts`（链路对象与 schema 默认值）；新增断言：旧形状存储配置在面板读取时显示为 `default` 链路，保存一次后存储只含 `chains`。
5. **文档（`docs/003-execution.md`、`docs/006-deployment.md`）**：删除旧版单链路回退描述，写明显式 `chains` 是必需配置、空链路使 setup 报 `repositoryUnset`；已有旧形状配置在读取时归一化为 `default` 链路并在面板保存一次后只存 `chains`。

## 任务拆解

- **C1（本 slice）**：上述 schema、归一化、面板字段、setup 字段、测试与文档的一次性改动；一个实现 lane + 一次双轴评审。
- **不在本次**：项目/仓库隔离（其他 slice）、旧版单链路的数据库重写迁移（本 slice 按要求只在读取时归一化，保存即落 `chains`）、其他 Source。

## 验证计划

- 定向：`pnpm vitest run tests/deployment.spec.ts tests/sources.spec.ts tests/panel-source.spec.tsx tests/runtime.spec.ts tests/model-surface.spec.ts tests/policy.spec.ts`
- 全量：`pnpm check`（typecheck + vitest + build），证据写入 `docs/issues/evidence/`。
- 双轴评审：Standards（模块边界、schema/归一化、测试质量、文档）+ Spec（5 条冻结验收标准逐条对照）。

## 交付记录

- 提交：`71670bad`（分支 `agent/github-source-e98e00c734ae`，基线 deployment `main` @ `04cb0449`），commit body 含 `slice-C1` trailer；作者 `cinvymoe-superagent`。
- PR：https://github.com/cinvymoe/dsh-superagent-prototype/pull/11（`pr_status: open`，`pr_arch_impact: local`）。
- 测试证据：`docs/issues/evidence/c1-check.log`（`pnpm check` exit 0，63 files / 1252 tests，Build complete）、`docs/issues/evidence/c1-targeted.log`（6 files / 530 tests）。
- 评审：`docs/issues/review.md`（Standards approve，无 must-fix；Spec 5/5 PASS）。
- 视觉证据：`docs/evidence/c1-github-chains/before-source.png` / `after-source.png`（同场景、1440×1100、浅色、zh-CN；Before = `04cb0449` 真实面板，After = 本分支 head）。
- 未启用 auto-merge，PR 由人复核合并。

## 沉淀记录

- 回归案例：`benchmarks/github-source-chains/c1-explicit-chains/`（README、requirement、task-contract、review、environment、retrospective、patterns、attempt-log、evidence/）；`docs/issues/benchmark` 符号链接指向该目录供 e5 门识别。
- 模式沉淀：schema 收敛 + 读取归一化 + 严格保存；`chains` 键存在（含空数组）即不回退旧字段；旧形状读取与面板保存的端到端断言；真实面板 Before/After 共享同一 SQLite 状态。
- 试错台账：`attempt-log.md`（实现 lane 一次通过；review lane 无输出后 worker 自审；profile 复制的 bundle 安装；环境敏感测试用干净环境复跑）。
- 测试环境前置：`environment.md`（Node 22 / pnpm 11.7，干净环境 `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm check`；真实面板隔离 profile + fake gh + 1440×1100 浅色 zh-CN）。
- 两索引：仓库无 `issues/README.md` 与 ADR 库索引，无需同步。
- 架构复核：仓库无 `docs/architecture` 与 `arch_*` 脚本；按 `docs/007-architecture.md` 人工复核模块/测试表无变化，`arch_impact: local`。
- worktree 回收：临时基线 worktree `/tmp/c1-chain-before` 已删除；本 ticket worktree 为当前执行会话目录且 PR #11 未合并，保留。`git worktree list` 无本 ticket 额外残留。
