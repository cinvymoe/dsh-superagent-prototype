# C1 评审与测试证据 · 对齐轮次与打回反馈（宿主侧）

- Run: `run-mwdqudkt-11`（execute，policy A1），issue `q-29218185:C1`
- Ticket: `9e69570faa5da701611f346b4232b0f1`
- 分支：`agent/slice-9e69570faa5d`，基线 `40191e32`（含 PR #20/#21 的 `main`）
- 实现：e2 派 `lane-T1-1`（subagent spawn，childId `089d05d5-c3bc-4864-8449-ddd6e973fedd`）在 ticket worktree 完成实现与定向自测；主会话负责复验、评审与证据落盘。
- 评审日期：2026-11-12
- 分支已 merge deployment `main` @ `32262807`（含 PR #24/#25/#26 的面板过滤、执行模式开关与消息倒序）；仅 `docs/005`、`docs/007` 冲突手工合并，merge 后按 main 的新夹具补 `roundId` 并重跑定向与全量。
- 分支随后又 merge deployment `main` @ `934a1f07`（PR #23 的关联工单 Open Session 行）；仅 `docs/005` 冲突手工合并，merge 后重跑 typecheck 与定向测试。

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/sources/local-format.ts` | `LocalAlignment` 增必填 `roundId` 与 `superseded` 状态；`LocalIssue` 增 `alignments?: LocalAlignment[]`，保留 `alignment` 作当前轮镜像；导出 `alignmentRounds`（旧记录归一为一轮，缺 `roundId` 补 `al-1`）与 `currentAlignment` |
| `src/app/local.ts` | `get`/`list` 返回归一化视图；`propose` 追加轮次、旧的 `proposed` 变 `superseded`、已确认时抛 `alignmentConfirmed`；`decide` 支持 `roundId`、旧轮抛 `alignmentRoundStale`、`confirm` 幂等、`reject` 记录原因并只在该轮首次打回时向 Thread 落一条 human 本地触发；`planInput` 取当前轮 |
| `src/app/runtime.ts` | `dispatchPlan` 取当前轮切片，不再读单槽位 |
| `src/app/tools/executor.ts` | `orchestrator_align` 返回当前轮状态/切片数；已确认后再调用由 `propose` 抛错 |
| `src/app/http.ts`、`src/app/api.ts` | 决定接口接受可选 `roundId` 并透传；`Api` body 类型同步 |
| `src/core/errors.ts`、`src/client/locales.ts` | 新增 `alignmentConfirmed`、`alignmentRoundStale` 及中英双语；面板新增 `discuss.superseded` 文案 |
| `src/client/discuss.tsx` | 决定携带页面渲染的 `roundId`；`statusTag` 认识 `superseded`；不新增历史列表 UI |
| `tests/local.spec.ts` | 轮次/supersede/打回反馈触发/第三轮/旧记录归一化/确认后拒绝提案 |
| `tests/local-align.spec.ts` | 打回反馈送达 Aligner、再次对齐、只派发最新轮、旧 `roundId` 拒绝、确认后再对齐报错且轮数不变 |
| `tests/fixtures/panel-server.ts`、`tests/panel-discuss.spec.tsx` | 类型收紧后的 alignment 夹具补 `roundId`，提案轮次 id 递增 |
| `docs/005-panel.md`、`docs/007-architecture.md` | Requirements 行与 local/local-format/测试表行更新为轮次语义 |

范围外且未改动：执行策略/项目仓库链/图片上传、`prompts/**`、`src/core` 的派发引擎（`acceptPlan` 幂等复用既有 Ticket）、Policy 与 Router。

## 双轴评审

### Standards 轴

结论：**通过（approve）**。

- **单一写入者**：轮次只由 `LocalIssues.propose`/`decide` 写；读取归一化只在 `local-format.alignmentRounds` 一处，`runtime`、`orchestrator_align` 与 `local.planInput` 复用 `currentAlignment`，没有第二套“取当前轮”的逻辑。`view()` 只在读取时物化轮次与镜像，不在启动迁移里写库。
- **模块边界**：记录形状落在 `src/sources/local-format.ts`（host 与面板共享），业务语义在 `src/app/local.ts`，HTTP 契约在 `api.ts`+`http.ts`，派发取值在 `runtime.ts`，工具在 `tools/executor.ts`；没有把轮次知识漏进 Policy/Executor/Engine。
- **错误语义**：两个新错误都用 `UserError` refused，经既有 `failure()` 映射为 400+`code`+`values`；`decide` 先校验 `roundId` 再写记录/派发，旧轮决定不产生副作用；`planEmpty` 顺序保持“确认前先判空切片”。
- **兼容与不变性**：存量的单 `alignment` 记录读取即一轮（`al-1`），不迁移、不批量改写；`alignment` 镜像继续服务既有读者；重复 `confirm` 提前返回（`decidedAt` 不变），`dispatchPlan` 仍由 `Engine.acceptPlan` 复用既有 Ticket；重复 `reject` 只刷新记录、不重复发反馈。
- **测试质量**：断言落在持久化记录（`store.get(...).alignments`）、真实 Session 投递（`h.relays`）、HTTP 状态码/code/values 与“未派发任何 plan ticket”的负向观测；覆盖旧记录、重复决定与确认后拒绝等边界；无网络依赖。
- **风格**：2 空格、无分号、单引号；JSDoc 与相邻声明同风格；diff 无无关格式化。

可接受限制（不修，理由如下）：

1. `reject` 对“已确认轮”未额外加拒绝码——面板已只对 `proposed` 显示操作，冻结判据未要求新增错误码，扩张会改变既有确认后语义。
2. 重复 `reject` 会刷新 `reason`/`decidedAt` 但不重复向 Thread 发反馈——避免同一轮刷屏；首次打回已把原因送达 Aligner。
3. 未知 `roundId` 与旧轮 `roundId` 共用 `alignmentRoundStale`——对调用方是同一处置（改用最新轮），错误文本给出具体轮次。
4. `tests/fixtures/panel-server.ts` 不维护完整轮次历史，只递增 `roundId`——测试替身简化，宿主记录才是真相。

### Spec 轴（冻结验收标准逐条）

| AC | 判据（原文摘要） | 测试/证据 | 结论 |
| --- | --- | --- | --- |
| AC1 | 连续两次 `propose` 得到两轮且旧 `proposed` 为 `superseded` | `tests/local.spec.ts > keeps every alignment round, supersedes an undecided one, and posts a rejection back to the thread once`：断言 `['superseded','proposed']`、`alignment` 镜像等于最后一轮、`roundId: al-2` | PASS |
| AC1 | `decide('reject','缩小范围')` 后该轮 `rejected` 且 `reason` 正确，同时新增一条 human 本地触发、文本含打回原因 | 同一测试：`['superseded','rejected']`、`reason==='缩小范围'`、`triggers.at(-1)` 为 `{source:'local',human:true}` 且 `text` 含原因；重复 reject 触发数不变 | PASS |
| AC1 | 此后 `propose` 追加第三轮 | 同一测试：`['al-1:superseded','al-2:rejected','al-3:proposed']` | PASS |
| AC1 | 直接写入带旧 `alignment` 字段的记录能读出一轮历史 | `tests/local.spec.ts > reads a record written before rounds existed as one round and proposes the second`：`store.set` 旧形状 → `get` 得 1 轮（补 `al-1`）→ 再 propose 得 2 轮且旧轮 superseded | PASS |
| AC2 | 打回后 Aligner 会话收到该反馈并再次 `orchestrator_align` 成功 | `tests/local-align.spec.ts > delivers a rejection to the Aligner Session and accepts a new round`：HTTP reject → `idle()` 后 `h.relays(sessionId)` 含 `缩小范围` → 第二次工具调用返回 `{status:'proposed',slices:1}`，轮次 `al-1:rejected, al-2:proposed` | PASS |
| AC2 | 确认只派发最新轮的切片 | `tests/local-align.spec.ts > dispatches only the slices of the current round`：第一轮 C1/C2、第二轮 D1，确认后 plan ticket 仅 `['D1']`，状态 `['superseded','confirmed']` | PASS |
| AC2 | 带旧 `roundId` 的决定经 HTTP 返回拒绝且带明确 code | `tests/local-align.spec.ts > refuses a decision that names an older round and dispatches nothing`：400、`code:'alignmentRoundStale'`、`values.round` 为旧轮、无 plan ticket、记录未变 | PASS |
| AC2 | 最新轮已确认后再 `orchestrator_align` 返回明确错误且轮数不增加 | `tests/local-align.spec.ts > refuses a new alignment proposal once the latest round is confirmed`：`rejects.toThrow(/already confirmed/)`，`alignments.length` 不变 | PASS |
| AC3 | `tests/locales.spec.ts` 通过（新错误码中英双语） | `docs/issues/evidence/c1-align-rounds-targeted.log`：locales 6 tests 通过；`USER_ERRORS` 两码均有 zh/en `userError.*` | PASS |
| AC3 | `pnpm typecheck` 与两个测试文件通过 | `docs/issues/evidence/c1-align-rounds-typecheck.log`（exit 0）；`docs/issues/evidence/c1-align-rounds-targeted.log`（3 files / 50 tests passed） | PASS |

## 验证记录

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `docs/issues/evidence/c1-align-rounds-typecheck.log` |
| `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts` | 3 files / 50 tests passed | `docs/issues/evidence/c1-align-rounds-targeted.log` |
| `pnpm vitest run tests/panel-discuss.spec.tsx tests/http.spec.ts tests/docs.spec.ts` | 3 files / 38 tests passed（lane 实跑） | lane 报告；全量 check 覆盖 |
| `env -u GIT_CONFIG_GLOBAL ... LC_ALL=C pnpm check` | 首轮 1300 passed / 2 个与本次改动无关的 5s 超时（`prompts`、`sources`，单跑 95 tests 全绿）；复跑 63 files / 1302 tests passed，build 成功，exit 0 | `docs/issues/evidence/c1-align-rounds-check.log`、`c1-align-rounds-check-retry.log` |
| merge deployment `main` @ `32262807` 后 `pnpm typecheck` | exit 0 | `docs/issues/evidence/c1-align-rounds-merge-typecheck.log` |
| merge 后定向 6 files（local/local-align/locales/panel-discuss/http/docs） | 99 tests passed | `docs/issues/evidence/c1-align-rounds-merge-targeted.log` |
| merge 后全量 `pnpm check` | 64 files / 1327 tests passed，build 成功，exit 0 | `docs/issues/evidence/c1-align-rounds-check-postmerge.log` |
| `git diff --check` | 无输出 | 提交前复核 |

## 架构影响

- `arch_impact: local`。仓库没有 `docs/architecture/` 与 `docs/architecture/scripts/arch_impact.py`（`scripts/` 只有 `dsh-superagent`），无法运行 arch_check/arch_anchor；按本仓既有做法以产品架构文档 `docs/007-architecture.md` 为准。
- 已更新 `docs/007-architecture.md` 的 `src/app/local.ts`、`src/sources/local-format.ts` 与两条测试表行，`docs/005-panel.md` 的 Requirements 行同步为轮次语义。
- 无 schema/DDL 变更：`LocalIssue` 是 KV JSON 记录，新字段可选、旧记录读取归一化，不迁移。
