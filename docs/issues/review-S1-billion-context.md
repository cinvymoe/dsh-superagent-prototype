# S1 评审与测试证据 · 主 Session 动态纳管 billion-context 压缩工具

- Run: `run-mwdmt49d-2`（execute，policy A1），issue `q-aa660352:S1`
- Ticket: `6f94b843ab41a9adc11ecedfae34d5e3`
- 分支：`agent/session-billion-context-6f94b843ab41`，基线 `deployment/main` @ `c68e6e44`
- 评审日期：2026-11-12
- 双轴评审由两个独立 lane 承载：R1（Standards 轴，T2/high，child `6aaf8c09`）、R2（Spec 轴，T2/high，child `33d1260c`）；测试证据由独立 lane V1 采集（child `5ab36c2a`）。主会话只做归档与签门。

## 变更范围

3 个已跟踪文件（+122 −8）+ 本单文档与证据日志：

| 文件 | 变更 |
| --- | --- |
| `src/app/sessions.ts` | 新增 `MAIN_TOOLS`（原 7 个内置，顺序不变）与 `COMPRESSION_TOOLS`（bili 六工具）；`decorate()` 主 Session 分支改用 `mainTools(agent)`：白名单 = 7 内置 + `get(name, scopeParentOf(agent))` 可见的压缩工具；订阅 `tools/change` 重算，列表变化时「先记住新表 → 释放旧 restriction → 安装新 restriction」（DSH 过滤是交集语义），带 allow 未变短路与 `applying` 重入保护；安装失败记 warn、恢复旧 restriction（旧表为空则重置为 `[]` 供下次事件重试）；`noWait` guard 不变 |
| `tests/runtime.spec.ts` | fake host 增加 `lateTools`（模拟 bili 在主 Session 创建后注册全局工具，参与 fake `get` 与 `restrict` 校验）、`released`（记录被释放的 restriction）、`refuseNextRestrict`（一次性失败注入）；新增 3 条单测：不可见时仅 7 内置且不抛错、创建后注册时替换为 13 项、重建失败后下一次 `tools/change` 重试成功且不炸装饰 |
| `docs/007-architecture.md` | `### Main Session tools` 段补一段：宿主提供 billion-context 压缩工具时 restriction 纳入六个工具、`tools/change` 重算使迟到注册可见、未装插件的宿主保持 7 个内置；保留「Avoiding code reads is a prompt rule」句 |
| `docs/issues/6f94b843ab41a9adc11ecedfae34d5e3.md` | 本 slice issue（需求原文、冻结验收标准、任务拆解、设计约束、证据回填） |
| `docs/issues/evidence/s1-*.log` | 定向测试、typecheck、全量测试、build、基线环境对照五份原始日志 |

未改动：bili 本体、profile/preset、`cordis.patch.yml`、公共 API/schema/配置键。

## Standards 轴（R1，独立 lane）

结论：**approve**（首轮 needs_revision → 修复后复审通过）。R1 以 DSH 实际实现为依据核对（`dsh-tools` 的 `restrict` 校验用 pre-restriction `restrictableNames`、过滤交集语义、注册/释放同步通知 `tools/change`；`dsh-scope` 的 undo 幂等；cordis 事件无 per-listener 容错），首轮 8 条发现的处置：

| # | 首轮发现 | 处置 |
| --- | --- | --- |
| 1 | major：lift-then-install 会出现短暂无限制窗口，安装失败时还可能完全没有 restriction（fail-open） | 已改为 **install-before-lift**：新过滤先装（校验用 pre-restriction 名字，旧过滤仍生效时不会抛），生效窗口 = 旧∩新 ⊆ 新；失败分支与 `current = []` 恢复机制一并删除 |
| 2 | major：`MAIN_TOOLS` 未过滤而 `install` 吞异常，缺一个内置工具会造成主 Session 无白名单（静默 fail-open） | 已加内置工具前置校验并在首次安装时**大声抛出**（错误信息点名缺哪个）；后续重建失败才记 warn 并保留旧 restriction，下次 `tools/change` 重试。`tests/fixtures/host.ts`、`tests/model-surface.spec.ts` 的 fake `get` 相应返回 7 个内置（真实宿主本就提供） |
| 3 | minor：旧 restriction disposer 抛错会让状态失步 | 已把 lift 包在 try/catch 内（新过滤已生效，窗口只会更窄，不会更宽） |
| 4 | minor：`applying` 守卫会丢真实通知 | 已改为 `pending` 标记 + `do … while (pending)` 排空 |
| 5 | minor：注释把短路归因于相等检查（实际是 `applying`） | 已重写 docstring/注释（强制内置、install-before-lift、pending 排空） |
| 6 | minor：测试无法捕捉交集/顺序缺陷 | fake 现在在 restrict 与 release 时都同步 `emit('tools/change')`，新增有序 `mutations` 日志并断言 `restrict 7 → restrict 13 → release 7`；disposer 用 `WeakSet` 幂等；保留失败重建重试用例 |
| 7 | nit：测试里重复常量 | 不修：既有测试（`refuses an ended ticket's worker…`）本就逐字写出 7 个名字，重复会漂移即失败；评审确认不反对 |
| 8 | nit：用例标题/注释不准确 | 已修正标题与注释 |

复审确认 1–6、8 全部 resolved，7 不反对；3 条注释 nits 已按建议改写。R1 的 process note（证据日志早于修复）已处理：五份日志在修复后的树上全部重生成（时间戳 23:19–23:21，见下表）。

## Spec 轴（R2，独立 lane）

结论：**pass**（首轮 pass；修复后复审指出 AC-3 证据时效问题 → 在冻结树上重生成证据后关闭，AC-1/2/4 仍 pass，AC-5 pending-owner）。

| AC | 判据 | 结论 | 证据 |
| --- | --- | --- | --- |
| AC-1 | 可见时 allow 含六个 ACP 工具；不可见时不含且不抛 `unknown global tool` | **pass** | `tests/runtime.spec.ts:1633` 可见断言 `rules[1] = [...MAIN_TOOLS, ...COMPRESSION_TOOLS]` 且 `mutations[1]` 为 restrict(13)；`:1623` 不可见断言只含 7 内置且 `mutations` 只有一次 restrict；实现 `src/app/sessions.ts:301` 只命名 `get(name, parent)` 可见的压缩工具。fake 的 restrict 对未知名抛错，而首次 install 现在会重新抛出（`sessions.ts:318`），所以「无条件写 compress」会炸装饰而非仅断言失败 |
| AC-2 | 创建后注册仍能获得（非创建时一次性快照） | **pass** | 同测试：创建时 7 名 → `lateTools.push(...)` + `tools/change` → 第二条 restrict(13)；`mutations` 固定 `restrict 7 → restrict 13 → release 7`（install-before-lift）；再 emit 不重建。fake 现在每次 restrict/release 都同步 `emit('tools/change')`，重入排水被真实覆盖 |
| AC-3 | 现有 runtime/bundle-patch 测试与 `pnpm typecheck && pnpm test && pnpm build` 全过 | **pass** | 冻结树（sessions.ts 23:18:23、runtime.spec.ts 23:11:34、两个 fake 23:15:32）上重生成的 `docs/issues/evidence/s1-targeted.log`（2 files / 97 tests，exit 0）、`s1-typecheck.log`（exit 0）、`s1-test.log`（63 files / 1288 tests，exit 0）、`s1-build.log`（Build complete，16 ESM files，exit 0）；源码 mtime 早于全部日志 |
| AC-4 | `docs/007-architecture.md` Main Session tools 段说明纳入 | **pass** | `docs/007-architecture.md:523`：纳入六工具 + `tools/change` 重算 + 未装插件保持 7 内置三点齐全，与修复后代码一致 |
| AC-5 | 部署后手工验证（工具面含 compress、`/__bili/sessions` blocks>0、无 `surface=off`） | **待复核（owner）** | 本环境不可执行：需合并 + 重启宿主。见「待复核清单」 |

Spec 轴保留的观察（非判据缺口）：AC-1 未单测「创建瞬间即可见」的分支（`refresh()` 同一路径，属覆盖增强）；fake 把 restriction 存成列表而非交集集合，「最终可见」由 mutations 顺序 + DSH 文档化的交集语义推得。R2 的 finding 1（issue 文档设计要点曾写「先释放再安装」）已通过修订该文档解决（冻结 AC 未动）；finding 2（lift 抛错时旧过滤仍在，ACP 工具被静默遮住且不重试）登记为低风险，见下。

## 测试证据（V1，独立 lane）

| 命令（均含 `env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM LC_ALL=C LANG=C`） | 日志 | 结果 |
| --- | --- | --- |
| `pnpm vitest run tests/runtime.spec.ts tests/bundle-patch.spec.ts` | `docs/issues/evidence/s1-targeted.log` | exit 0；2 files / 97 tests |
| `pnpm typecheck` | `docs/issues/evidence/s1-typecheck.log` | exit 0 |
| `pnpm test` | `docs/issues/evidence/s1-test.log` | exit 0；63 files / 1288 tests |
| `pnpm build` | `docs/issues/evidence/s1-build.log` | exit 0；16 ESM files / 776.91 kB |
| 基线对照（去掉 env 覆盖）`pnpm vitest run tests/runtime.spec.ts` | `docs/issues/evidence/s1-baseline-env.log` | exit 1；2 failed 是测试断言 `GIT_CONFIG_GLOBAL` 未设置，而本工单 shell 导出了 `GIT_CONFIG_GLOBAL=/root/.dsh/state/superagent/worker-gitconfig`、`GIT_CONFIG_NOSYSTEM=1`，属环境噪声，非本改动回归 |

试错记录：V1 lane 首次派发（child `fc4e78d9`）在开始前异常失败、未产出证据；重派（child `5ab36c2a`）complete，上表为第二次结果。另，改动前全量测试在同样 shell 下也出现同样两条环境失败（`tests/runtime.spec.ts:1005`、`:1022` 断言环境变量未设置），与改动无关。

## 评审处置

- 主会话在 T1 自测中手工核对 diff 时发现并处置：`mainTools()` 失败分支在「首次安装失败 + 旧表为空」时会把 `current` 记成新表，导致后续 `tools/change` 因相等短路而永不重试，且注释与代码不符。已由 T1 lane 修复（`current = previous`、非空才恢复旧 restriction、恢复也失败则 `current = []` 供重试），并新增「重建失败后重试」单测。
- R2 提出的两处含糊点（AC-1 未覆盖创建瞬间可见；fake 的 unknown-tool 文案与 DSH 原文不同）均按技术核实判为可接受，理由见上。
- 宿主构建的 `facts` 恒为 `EMPTY_FACTS`（本机加载的 `dsh-feature-exec` 中 `updateFacts` 无调用方），e3 的 `review-two-axis` / `arch-impact-decided` 机器门读不到 `review.md` 与 frontmatter；按 A1 授权以 agent-attested 门签名并附证据，不影响本次判定内容。

## 残留风险

1. **lift 抛错（低）**：`previous()` 释放旧 restriction 时若其内部同步通知的某个监听器抛错，异常被 `sessions.ts:326-328` 捕获记日志；此时旧过滤仍在生效（交集 = 旧 7 名），ACP 工具保持被遮住，而 `current` 已是新列表，后续相同 allow 的 `tools/change` 会短路、不再重试。DSH 的 restriction disposer 是幂等 undo，当前没有任何包监听 `tools/change`（只有发射方），故该路径实际不可达；不为它引入状态恢复机制。
2. **Windows 宿主（既有，非本单引入）**：router preset 在 win32 不注册 `bash` 而注册 `pwsh`，`MAIN_TOOLS` 仍强制 7 个内置，因此 win32 上主 Session 装饰会失败——改动前 `restrict(7)` 同样会抛 `unknown global tool bash`，本单只是把错误文案改为点名缺项。修复 Windows 需要单独决定主 Session 的 shell 工具面，超出本 slice。
3. **未装 bili 的 profile**：仅以单测覆盖「只有 7 内置」；合并后可在无插件的 profile 上抽查一次工具面（不阻塞本单）。

## 待复核清单（随最终交付呈交，不阻塞 PR）

- **AC-5 部署后手工验证**（owner 在合并、重启宿主后执行）：① 新开一个 orchestrator 会话，其请求工具面包含 `compress`（及另外五个 ACP 工具）；② `GET /__bili/sessions` 中该会话 `blocks>0`、`tokensSaved` 增长；③ bili 日志不再出现该会话 `nudge ARMED-SUPPRESSED ... surface=off`。结果回填 issue 的「证据与记录（随执行回填）」。
- 未装 bili 的 profile：行为应保持 7 个内置工具；本单仅以单测覆盖，未在真实无插件 profile 上复验（合并后可按需抽查）。
