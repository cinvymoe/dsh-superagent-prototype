# C1 retry 评审与测试证据

- Run: `run-mwcyi2zf-2`（execute，policy A1），issue `q-94e6e32e:C1`
- Ticket: `0b129da0e330dcbbb344fc21a2393ee2`
- 分支：`agent/worktree-0b129da0e330`，基线 `310ae2e`（deployment `main`，含已合入 C2/C3；工单 worktree 初始种子为 `5556291`）
- 评审日期：2026-11-12

## 变更范围

工作区改动（product diff）只有 3 个文件：

| 文件 | 变更 |
| --- | --- |
| `src/app/local.ts` | `createProject` 先 trim 再判断空值：省略/空串/纯空白都视为未配置（不落 `worktreeRoot` 字段）；非空相对路径仍抛 `UserError('projectWorktreeRoot')`；合法绝对路径存 trim 后的值 |
| `tests/local.spec.ts` | worktree root 用例改为“纯空白 = 未配置”，相对路径（含首尾空白）仍报错；保留 trim 绝对路径、省略、空串断言 |
| `tests/local-align.spec.ts` | HTTP `POST local/projects` 纯空白 `worktreeRoot` → 200 且响应无 `worktreeRoot` 字段 |

C1 其余实现（目录解析、`execution.worktreeRoot` 落库、`verifyWorktreeRoot` 启动校验、`PrepareFailed` 不自动重试、retry/人消息恢复）已在前序 `2e79202` 合入基线，本次未重复实现；对应 `tests/local-align.spec.ts` 的 `project worktree roots` 分组与 `tests/runtime-concurrency.spec.ts` 的 `ticketExecution` 单测保持通过。

## 双轴评审

### Standards 轴

结论：**通过（approve）**。

- 模块边界：改动只在 `LocalIssues.createProject` 的输入归一化内，没有把项目解析或校验塞进其他模块；`LocalProjectInput` 可选字段与 `LocalProject.worktreeRoot?` 契约保持。
- 错误语义：空值归一化在 `isAbsolute` 校验之前完成；非空相对路径仍走既有 `UserError('projectWorktreeRoot')`（错误码与中英文案未变，`tests/locales.spec.ts` 通过）。
- 数据落库：`...(worktreeRoot !== undefined ? { worktreeRoot } : {})` 保持不变，未配置值不会在记录中出现字段。
- 测试质量：测试断言行为而非实现；覆盖省略、空串、纯空白、trim 后绝对路径、相对路径（含首尾空白）；未削弱 `project worktree roots` 分组任何既有断言。
- 仓库规范：无新依赖、无产品文档/客户端改动、无无关重构；`git diff --check` 通过。
- 独立评审 lane：`71081dff-a61c-48b0-a630-0ae26ef323a3`（Standards），见下方“尝试记录”。

### Spec 轴（按冻结验收标准逐条）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `pnpm typecheck` 与相关 vitest 通过；未配置 `worktreeRoot` 的现有用例和部署行为不变。 | PASS | `pnpm typecheck` exit 0；targeted 4 files / 82 tests；full 62 files / 1240 tests；`pnpm build` 通过；默认根/既有 prepare 断言未改（`docs/issues/evidence/verification.log`） |
| 2 | 项目 `worktreeRoot=/tmp/root` 时，本地工单 `execution.directory=/tmp/root/<短名>`；prepare cwd=`/tmp/root`；`DSH_SUPERAGENT_DIR` 指工单目录，`DSH_SUPERAGENT_GITHUB_REPOSITORY` 仍为项目仓库。 | PASS | `tests/local-align.spec.ts:138` 起：`execution.directory === join(root, name)`、`worktreeRoot === root`、`execution.repository === 'acme/project-widgets'`、prepare spawn `cwd === root` 且 env 两变量正确 |
| 3 | 项目未配置 `worktreeRoot` 时仍用 `executor.directory`（非空）或 `<stateDir>/work`；GitHub/Feishu 工单不受项目字段影响。 | PASS | `tests/local-align.spec.ts` “keeps the executor directory...” 两段（executor root / 默认 root）；Feishu 用例（rooted 项目下仍在默认根）；`tests/runtime-concurrency.spec.ts` `ticketExecution` 单测（默认无 `worktreeRoot` 字段、显式目录落库） |
| 4 | 显式根目录不存在、是普通文件或不可写时，不启动 worker Session；最新 Assignment 报 failed，summary 含绝对路径及失败原因；该路径未创建，默认根下无该工单目录。 | PASS | `tests/local-align.spec.ts:182`（missing）、`:198`（regular file）、`:216`（`/proc/sys` 写探测）：均断言 `h.agents.has(worker-...) === false`、最新 report `failed`、summary 含路径与 `does not exist`/`is not a directory`/`not writable`、根未创建、默认根下无目录、prepare 未运行 |
| 5 | 这类失败不被自动重试；修正根目录后，retry 或该工单线程上的人消息能重新准备并启动。 | PASS | 代码：`PrepareFailed` 在 `src/executor/dsh.ts` `launchQueued` 跳过 transient retry；`tests/local-align.spec.ts:246`（retryTicket）与 `:262`（`runtime.local.comment`）在修复根后重新 prepare、Session 启动、目录创建 |
| 6 | 已接受工单的 `execution.directory` 不因之后修改根目录设置而改变。 | PASS | `tests/local-align.spec.ts:279`：接受后同时改项目记录 `worktreeRoot` 与 `executor.directory`，原 ticket `execution` 完全不变；新工单用新根 |
| 7 | `createProject` 对相对路径给出明确错误；省略、空字符串和纯空白等价于未配置。 | PASS（本次增量） | `src/app/local.ts:54-56`；`tests/local.spec.ts:72-89`（Blank 无字段、Omitted/Empty 无字段、`relative/root` 与 `  relative/root  ` 均 `projectWorktreeRoot`）；`tests/local-align.spec.ts:107-110` HTTP 纯空白 200 无字段。Lane 红→绿：修复前 `tests/local.spec.ts` 1 failed / 19 passed，修复后 20/20 |

补充核对（继承 C1 核心）：

- `src/app/execution-environment.ts` `resolvedExecutionRoot` 的优先级与 `explicit` 判定与冻结决定一致。
- `src/executor/dsh.ts` `verifyWorktreeRoot` 做 `stat` + `access(W_OK)` + `mkdtemp` 写探测（root 用户绕过 DAC 的只读挂载场景）；失败消息包含绝对路径与原因。
- `src/app/runtime.ts` 按来源 Trigger `meta.project` 解析项目根并注入 `ExecutorHost.worktreeRoot`；GitHub/Feishu 无 project meta，不受影响。

## 测试证据

- `pnpm typecheck`：exit 0，无诊断。
- `pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/runtime-concurrency.spec.ts tests/locales.spec.ts`：4 files / 82 tests passed。
- `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm test`：62 files / 1240 tests passed，exit 0。
- `pnpm build`：Build complete，exit 0。
- `git diff --check`：通过。
- 原始输出：`docs/issues/evidence/verification.log`（实现 lane 在种子基线的独立验证摘要：typecheck 0；targeted 82/82；full 1233/1233；最终在 deployment main 基线上复跑为 targeted 82/82、full 1240/1240）。

## 架构影响

- `docs/architecture` 与 `arch_impact.py`/`arch_check.py` 在本仓库不存在；按现有 `docs/007-architecture.md` 人工复核：本次只改 `LocalIssues.createProject` 的输入校验与测试，模块表、测试表、依赖方向均无需变更；`arch_impact: local`。
- 无公共 API/schema/安全/凭据变更；HTTP body schema 不变（原本就 trim），端到端行为对 API 调用者保持。

## 尝试记录

- 实现 lane `lane-C1-retry-1`（subagent `5b7de0e4-36f8-42f5-837b-d69a79e6b03a`）：一次通过；红→绿与三条验证命令均实际执行。
- 独立 Standards review lane `71081dff-a61c-48b0-a630-0ae26ef323a3`：启动后持续运行无输出（与 C3 的 review lane 同类运行时限制），已中断；由 worker 按 Standards 清单完成自审并逐项留证。
- 独立 Spec review lane `6154bf14-7318-4544-80b5-94daaa891804`：同样无输出，已中断；由 worker 按冻结验收标准逐条完成自审并留证。
- 说明：两个 review lane 的中断是运行时/模型侧限制，不是代码或验收失败；实现 lane 与测试命令均正常完成。
- 全量测试在干净环境（`env -u GIT_CONFIG_GLOBAL LC_ALL=C`）一次通过；无基线失败。

## 测试环境前置

不适用（纯应用逻辑与单元/集成测试；无真机、GUI、截图、旋转或物理设备要求）。

## 结论

- Standards：通过。
- Spec：7/7 条冻结验收标准有可复核证据。
- 建议进入 PR 提交；`Architecture impact: local`，PR 由人复核合并，不启用 auto-merge。
# Two-axis review · C2 retry · Discuss form and API expose the project worktree root

Ticket: `1478bf96058ac87a5dcf08731cb9147b` · slice `C2` of alignment `q-94e6e32e`
Base: deployment `main` @ `310ae2e`; branch tree equals `310ae2e` before this slice's test-only delta.
Diff: `tests/local-align.spec.ts`, `tests/fixtures/panel-server.ts`, `tests/panel-discuss.spec.tsx` (+59 lines, 0 deletions; no production code).

## Standards axis — PASS

- **Scope and module boundaries.** No `src/**` change. The Discuss production path already satisfies the frozen behavior in `src/app/http.ts:206`, `src/app/local.ts:53-57`, `src/client/discuss.tsx:60-65,82,94-97,184` and `src/client/locales.ts:130-131,173,429`; this slice only locks it with tests, as the retry plan intends.
- **Test quality.** The new HTTP assertions extend the existing end-to-end route test with the retry's clarified blank semantics (omitted / empty / whitespace-only → unconfigured) and check legacy records in both the list and the detail. The jsdom tests cover the form payload, the project row, the requirement detail, and the localized refusal toast. Assertions are behavioral (status, body property absence, rendered text), not implementation-coupled.
- **Fixture fidelity.** `tests/fixtures/panel-server.ts` now mirrors the host's structured `projectWorktreeRoot` refusal (400 + `code`) so the panel's error path is exercised against the same contract as `src/app/http.ts:97` (`UserError` → 400 with `code`). The fixture keeps the existing "spread only when truthy" record shape.
- **Diff hygiene.** `git diff --check` clean; no dead code, no duplicated assertions, no changes to unrelated fixtures.
- **Limitation.** The implementation lane `lane-T1-1` (subagent `e6b6e49d-8411-44ed-b636-a24f3d9222cb`) failed before producing any edit or final message in this runtime; the worker completed the same contract directly and records that process limitation here.

## Spec axis — PASS (6/6 frozen C2 criteria)

1. **`POST local/projects` with `worktreeRoot=/srv/wt` returns and persists; omitted/empty unconfigured; relative 400 with absolute-path explanation.** `src/app/http.ts:206` parses/trims the optional field; `src/app/local.ts:53-57` stores only an absolute value and throws `projectWorktreeRoot`; `tests/local-align.spec.ts:97-135` asserts valid persistence, list visibility, detail visibility, empty, omitted, whitespace-only, and the relative 400 body (`code: projectWorktreeRoot`, error containing `absolute path`).
2. **`GET local/projects` and `GET local/issues/:id` return the field; legacy records legal.** `tests/local-align.spec.ts:103-107` (new project through both routes) and `:114-135` (legacy project absent from detail/list field), plus `src/app/http.ts:218-224` returning the project object.
3. **Discuss form submits `worktreeRoot`; blank not submitted; project row shows it; zh/en copy.** `src/client/discuss.tsx:60-65` builds the payload only from a trimmed non-empty value; `:82` and `:184` render it on the project row and requirement detail; `tests/panel-discuss.spec.tsx:19-31` (payload + row), `:34-43` (empty omitted), `:61-69` (English field/hint), `:71-82` (whitespace-only omitted), `:84-99` (detail display + legacy rendering).
4. **Execution settings root hint contains “显式配置时必须已存在且可写”.** `src/client/locales.ts:429`; `tests/panel-execution.spec.tsx:111-118` opens the tooltip and asserts the literal phrase.
5. **jsdom panel tests cover payload and display; HTTP route tests cover valid/invalid; vitest and `pnpm check` pass.** The new tests above plus the existing suite; `docs/issues/evidence/verification.log` records typecheck, targeted 6 files / 58 tests, full `pnpm check`, and `git diff --check` exit codes.
6. **UI PR description carries Before (main baseline) and After (this branch) captures, same scenario/viewport/theme, labelled.** This retry changes no UI: the C2 UI landed in `f4421aa` (PR #3, merged into `310ae2e`). The PR description pairs the previously captured real baseline images (`790f12f`, `docs/evidence/c2-worktree-root/before-*.png`) with fresh real captures from this branch (`docs/evidence/c2-worktree-root-retry/after-*.png`, 1440x1100, light, zh-CN) and states the revision labels explicitly.

## Conclusion

Approve. The slice is test-only, the production behavior is the already-merged C2 delivery, and the retry delta closes the remaining boundary evidence without changing public API, schema, or deployment behavior.

Architecture impact: local (test/fixture only; `docs/007-architecture.md` module and test tables remain accurate because no test file was added).
