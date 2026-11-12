# C1 评审与测试证据 · 删除旧版单链路，GitHub Source 只保留显式 chains

- Run: `run-mwd7uomr-1`（execute，policy A1），issue `q-141a6a1e:C1`
- Ticket: `e98e00c734ae15fdffa3950e7bbbda0a`
- 分支：`agent/github-source-e98e00c734ae`，基线 deployment `main` @ `04cb0449`
- 评审日期：2026-11-12

## 变更范围

16 个已跟踪文件（+193 −89）：

| 文件 | 变更 |
| --- | --- |
| `src/deployment.ts` | `GithubConfigSchema` 只含 `cli`/`chains`/轮询与开关字段并 `.strict()`；删除 `GithubAccountsSchema` 与 `repository`/`intakeRepository`/`codeRepository`；`GithubChainSchema` 要求 `id` 与 `codeRepository` 非空、`intakeRepository` 解析期回退到执行仓库；新增 `normalizeGithubConfig()` 读取旧形状为 `id=default` 链路并丢弃旧字段；`resolveDeployment()` 先归一化再解析，空 `chains` 抛 `SetupError('repositoryUnset')`；`SETUP_FIELDS.github = ['chains','cli']` |
| `src/sources/kind.ts` | `SourceKind` 增加可选 `normalizeConfig?(stored)`，注释限定“读取已存配置” |
| `src/sources/registry.ts` | `resolve()` 在 `schema.safeParse` 前调用 `normalizeConfig`；`validate()`（面板保存）不变，仍走严格 schema |
| `src/sources/github.ts` | 删除三个旧版字段；链路 rows 的 `intakeRepository` 标 `optional`，hint 说明 id/执行仓库必填；`policy.rows` 先归一化；`find()` 使用 `config.chains` |
| `src/app/setup.ts` | 删除旧版 `chains` 注释 |
| `docs/003-execution.md`、`docs/006-deployment.md` | 删除旧版单链路回退描述，写明显式 `chains` 必需、空链路 setup 报 `repositoryUnset`、旧形状读取归一化且面板保存一次后只存 `chains` |
| `tests/*`（10 个文件） | 默认配置改 chains 形状；新增归一化、空链路、缺 `id`/`codeRepository`、面板旧形状读取与保存只存 `chains` 等断言 |
| `docs/evidence/c1-github-chains/` | 同场景、同视口（1440×1100）、浅色、zh-CN 的真实面板 Before/After 截图 |

## 双轴评审

### Standards 轴

结论：**通过（approve）**，无 must-fix。

- **schema 与读取归一化分离清楚。** `GithubConfigSchema`（`src/deployment.ts:57-70`）严格只接受 `{cli, chains, pollSeconds, failuresBeforeError, observe*}`；旧字段在 `GithubConfigSchema.parse` 直接抛错（测试 `tests/deployment.spec.ts` 的 `normalizeGithubConfig` 用例断言 `{repository}` 被拒）。旧形状只在读取路径由 `normalizeGithubConfig`（`src/deployment.ts:72-90`）转换；`SourceRegistry.resolve`（`src/sources/registry.ts:134-138`）用可选 `normalizeConfig` 钩子应用它，而 `SourceRegistry.validate`（同文件 54-58）不应用，保存始终写当前形状。
- **回退语义正确。** `normalizeGithubConfig` 只有在不存在的 `chains` 键时才由旧字段生成 `default` 链路；显式 `chains: []`（即使带 `repository`）保持空数组（`tests/deployment.spec.ts:118,125`），`resolveDeployment` 随后抛 `repositoryUnset`。不会重新引入 `repository` 回退。
- **链路校验严格。** `GithubChainSchema` 的 `id` 与 `codeRepository` 无默认值、必须非空（`REQUIRED_REPOSITORY`），`intakeRepository` 只在解析成功后回退到 code（`tests/deployment.spec.ts:130-136`）；面板 rows 的 `id`/执行仓库为 required 输入，缺字段保存被 400 拒绝（`tests/panel-source.spec.tsx` 的 `refuses a chain row...`）。
- **测试质量。** 断言是行为化的（HTTP 400、GET settings 的显示形状、保存后的存储值），没有实现耦合；既有 `tests/deployment.spec.ts`、`tests/sources.spec.ts`、`tests/runtime.spec.ts` 等覆盖保留并改为 chains 形状，没有削弱。`tests/fixtures/panel-server.ts` 新增 ZodError→400，使面板错误路径与 `src/app/http.ts:93` 一致。
- **文档一致。** `grep` 确认 `docs/003`/`docs/006` 不再出现「legacy single-chain fields form the default chain」「legacy `repository`... fallback」类描述；新文案与代码行为一致。
- **范围。** 未触碰项目/仓库隔离等其他 slice；无新依赖；无无关重构。
- 备注（非阻塞）：`src/sources/github.ts:313` 的单参 `pollRound` 重载保留了一个合成 `default` 链路，仅用于手工构造单一 deployment 的旧式调用者，避免空配置崩溃；正常 watch 流程只遍历显式 chains，不会走到该分支。

### Spec 轴（按冻结验收标准逐条）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `GithubConfigSchema` 只接受 `{cli, chains, ...}`；`chains` 为空时 setup 返回 `repositoryUnset`，不回退 `repository` | PASS | `src/deployment.ts:57-70,141-144`；`tests/deployment.spec.ts` ›「resolves every configured repository chain, and setup needs at least one chain」：`{chains: []}` 与 `{chains: [], repository: 'acme/widgets'}` 均 `repositoryUnset`；「normalizes...」断言 `{repository}` 被 schema 拒 |
| 2 | 旧形状已存配置读取归一化为 `id=default` 链路；面板保存一次后存储只含 `chains`，不含旧字段 | PASS | `normalizeGithubConfig`（`src/deployment.ts:72-90`）+ `SourceKind.normalizeConfig` + `SourceRegistry.resolve`（`src/sources/registry.ts:134-138`）；`tests/deployment.spec.ts` ›「normalizes...」；`tests/panel-source.spec.tsx` ›「reads an old single-chain configuration as the default chain and saves it once as chains only」断言 GET 显示 `default` 行且保存后 config 无 `repository`/`intakeRepository`/`codeRepository`；手工在真实 after 构建上验证 sqlite `settings-version:2` 仅含 `chains`（另见证据） |
| 3 | Source 设置卡无「旧版单链路」「旧版仓库（兼容）」；链路行可新增/编辑；缺 `id`/`codeRepository` 被拒 | PASS | `src/sources/github.ts:40-46` 字段清单；`tests/panel-source.spec.tsx` ›「shows the account each CLI signs in as...」断言 labels 仅 `['智能体的 GitHub CLI','轮询间隔 / 秒','连续失败几次后报告异常']` 且文本不含旧字段；「edits repository chain rows...」新增/编辑并保存；「refuses a chain row...」缺 codeRepository 返回 400 |
| 4 | 相关定向测试更新并通过；`pnpm check` 全绿 | PASS | `docs/issues/evidence/c1-targeted.log`：6 files / 530 tests passed；`docs/issues/evidence/c1-check.log`：`pnpm check` exit 0，63 files / 1252 tests passed，Build complete |
| 5 | `docs/003` 与 `docs/006` 不再描述旧版回退，写明显式 `chains` 为必需配置 | PASS | `docs/003-execution.md:81` 删除 legacy default chain 句；`docs/006-deployment.md:25,144,202` 改写为显式 `chains` 必需/空链路 `repositoryUnset`/旧形状读取归一化 |

## 测试证据

- `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm typecheck`：包含在 `pnpm check` 内，exit 0。
- `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm vitest run tests/deployment.spec.ts tests/sources.spec.ts tests/panel-source.spec.tsx tests/runtime.spec.ts tests/model-surface.spec.ts tests/policy.spec.ts`：6 files / 530 tests passed（`docs/issues/evidence/c1-targeted.log`）。
- `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm check`：63 files / 1252 tests passed，Build complete，exit 0（`docs/issues/evidence/c1-check.log`）。
- 说明：直接继承宿主环境的 `GIT_CONFIG_GLOBAL`/git locale 会使 `tests/runtime.spec.ts` 的 2 条 env 断言与 `tests/environment.spec.ts` 的 locale 断言失败；这些在干净环境通过，且 lane 已用 `git archive 04cb0449` 复核为基线既有环境敏感项，与本次改动无关。
- `git diff --check`：通过。

## 视觉证据（UI 变更）

同一场景（GitHub Source 设置卡：已存旧形状配置 `repository=acme/widgets, intakeRepository=acme/intake, codeRepository=acme/widgets`）、同一视口 1440×1100、浅色、zh-CN：

| 场景 | Before（`main` @ `04cb0449`） | After（本分支 head） |
| --- | --- | --- |
| Source 设置卡 | `docs/evidence/c1-github-chains/before-source.png`（显示「接收 Issue 的仓库（旧版单链路）」「执行代码的仓库（旧版单链路）」、链路 rows 为空） | `docs/evidence/c1-github-chains/after-source.png`（显示 `default` 链路行：acme/intake → acme/widgets，无旧字段） |
| 展开高级 | `before-source-advanced.png`（含「旧版仓库（兼容）」） | `after-source-advanced.png`（仅轮询间隔/失败阈值） |

## 架构影响

- 本仓库无 `docs/architecture` 与 `arch_impact.py`；按 `docs/007-architecture.md` 人工复核：改动限于 deployment schema/读取归一化、Source registry 的可选读取钩子、GitHub Source 字段与 setup 字段检测、文档与测试；模块表与依赖方向不变。
- `Architecture impact: local`。无公共 HTTP API 变化（`src/app/http.ts` 不变；`GithubConfigSchema` 属于 Source 配置结构，Panel 保存行为按要求改变），无数据库 schema 升级（读取时归一化，不重写旧记录）。

## 尝试记录

- 实现 lane `lane-T1-1`（subagent `9e54adcd-3463-47b0-adc5-cca7611f0587`）：完成全部实现与测试，报告 528 passed / 2 env 失败（基线同败），干净环境全绿。
- Worker 在 lane 之后补了一条冻结标准 1 的直接断言（`{chains: [], repository: 'acme/widgets'}` → `repositoryUnset`），并复跑 `tests/deployment.spec.ts` 8/8 与 full `pnpm check`。
- 独立双轴评审 lane `10505a7c-f29e-4152-9404-a9749309e06c`：启动后持续运行无输出（与此前 review lane 的运行时限制相同）；已由 worker 按 Standards/Spec 清单完成自审并逐条留证。
- 真实面板 Before/After 截图：隔离 profile `c1chain-before`（基线 `04cb0449` 构建）与 `c1chain-after`（本分支构建）各起一个真实 DSH web 服务，同一 SQLite 状态（旧形状 GitHub 配置）下截取。

## 结论

- Standards：通过；无 must-fix。
- Spec：5/5 条冻结验收标准有可复核证据。
- 建议进入 PR 提交；`Architecture impact: local`，PR 由人复核合并，不启用 auto-merge。
