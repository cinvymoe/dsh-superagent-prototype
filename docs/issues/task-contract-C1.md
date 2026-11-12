# task-contract · T1 · C1 删除旧版单链路，GitHub Source 只保留显式 chains

## 背景

- 对齐 issue：`q-141a6a1e`，slice `C1`；冻结验收标准见 `docs/issues/e98e00c734ae15fdffa3950e7bbbda0a.md`。
- 仓库/工作区：`/data/project/workspace/dsh-worktrees/github-source-e98e00c734ae`，分支 `agent/github-source-e98e00c734ae`，基线 `04cb0449`。
- 需求：删除 GitHub Source 的旧版单链路（`repository` / `intakeRepository` / `codeRepository` 回退），`chains` 成为唯一配置；旧形状已存配置读取时归一化为 `id=default` 链路，面板保存一次后只存 `chains`。

## 唯一目标

把 GitHub Source 配置收敛为显式仓库链路，并让旧形状已存配置仍可读：

1. `src/deployment.ts`
   - `GithubConfigSchema` 只含 `cli`、`chains`、`pollSeconds`、`failuresBeforeError`、`observeIssues/Pulls/Comments/Ci`，`.strict()`。删除 `GithubAccountsSchema` 与旧字段；`GithubChainSchema` 的 `id` 必填（lowercase-kebab-case）、`codeRepository` 必填（`owner/name`），`intakeRepository` 可空、解析时回退到 `codeRepository`。
   - 新增 `normalizeGithubConfig(stored: unknown): Record<string, unknown>`：`chains` 存在（含空数组）时原样去旧字段；`chains` 不存在且旧字段有值时产出 `chains: [{ id: 'default', intakeRepository, codeRepository: codeRepository || repository }]`；旧字段无有效 code 时产出 `chains: []`。旧字段一律丢弃。
   - `githubChains(config)` 返回 `config.chains`；`githubRepositories()` 以链路 `codeRepository` 为必填、`intakeRepository || codeRepository` 为 intake。`resolveDeployment()` 先 `normalizeGithubConfig()` 再解析，`chains` 为空抛 `SetupError('repositoryUnset')`。
2. 读取归一化接入
   - `src/sources/kind.ts` + `src/sources/registry.ts`：给 `SourceKind` 增加可选 `normalizeConfig?(stored: unknown): unknown`，`SourceRegistry.resolve()` 在 `schema.safeParse` 前调用（只用于读取已存配置，不用于面板保存校验）。
   - `src/sources/github.ts`：`normalizeConfig: normalizeGithubConfig`；`policy.rows(stored)` 同样先归一化；`find()` 用 `config.chains`。
3. `src/sources/github.ts` 字段：删除 `intakeRepository`、`codeRepository`、`repository` 三个旧字段；`chains` rows 列保持 `id` / `intakeRepository` / `codeRepository`，`intakeRepository` 标记 `optional: true`，更新中文/英文 hint（说明必须至少一条链路、id/codeRepository 必填、intake 留空即用执行仓库）。
4. `src/app/setup.ts`：`SETUP_FIELDS.github` 收敛为 `['chains', 'cli']`，删除「absent legacy chain list」注释。
5. 文档：`docs/003-execution.md` 删除「legacy single-chain fields form the default chain」；`docs/006-deployment.md` 删除旧字段回退描述（第 25 行附近、`source:github` 配置说明），写明显式 `chains` 是必需配置、没有链路时 setup 报 `repositoryUnset`，旧形状配置在读取时归一化为 `default` 链路、面板保存一次后只存 `chains`。
6. 测试（按需增删，但不得削弱既有覆盖）：
   - `tests/deployment.spec.ts`：旧字段用例改为新形状；新增/保留：空 `chains` → `repositoryUnset`；旧形状 `{repository, intakeRepository, codeRepository, cli}` → 解析为 `default` 链路；缺少 `id` 或 `codeRepository` 的链路被 schema 拒绝。
   - `tests/panel-source.spec.tsx`：字段清单不再含「旧版单链路」「旧版仓库（兼容）」；链路行可新增/编辑并保存；缺 `id`/`codeRepository` 的保存被拒（fixture 走 `kind.schema.parse`，400）。
   - `tests/fixtures/panel-server.ts`、`tests/runtime.spec.ts`、`tests/model-surface.spec.ts`、`tests/sources.spec.ts`、`tests/policy.spec.ts` 等默认配置改为 chains 形状；旧形状读取归一化可保留一处端到端断言。
   - 新增：旧形状存储配置经 `GET settings` 展示为 `default` 链路；面板保存一次后 `server.settings.sources.github.config` 只含 `chains`（无旧字段）。

## 不可做

- 不改「每个项目独立/仓库隔离」相关代码（其他 slice）。
- 不做数据库 schema 升级/重写迁移；只做读取归一化 + 保存落 `chains`。
- 不新增依赖；不改 `docs/issues/` 下的计划与评审文件（实现 lane 只产出代码/测试/产品文档）。
- 不 commit、不 push、不建 PR。
- 若发现冻结标准自相矛盾或必须跨出本 slice 范围，停止并在报告中说明，不自行扩张。

## 验证命令

- `pnpm typecheck`
- `pnpm vitest run tests/deployment.spec.ts tests/sources.spec.ts tests/panel-source.spec.tsx tests/runtime.spec.ts tests/model-surface.spec.ts tests/policy.spec.ts`
- `pnpm check`（全量，若时间允许；至少 typecheck + 定向 vitest + build）

## 回报格式

1. 改动文件与关键 diff 摘要。
2. 每条冻结验收标准对应的实现位置与测试名。
3. 上述命令实际结果（通过/失败数；失败项是否与基线的既有失败相同）。
4. 未完成项或限制。
