This is by an automated agent, not a human.

## 结果

让已保存的 `agents` 配置在运行期生效：主 Session / 对齐 Agent / 执行器（及其子代理）按角色计算工具允许集，保存 `agents` 后在下一步刷新；三角色模型覆盖只在新建 Session 注入。**不新增配置字段、不改 HTTP 路由**（数据模型、校验与 API 由依赖 C1 提供），面板「智能体」页由 C3 交付。

- 新 `roleTools` / `turnedOff` / `orderedTools`（`src/app/agent-tools.ts`）：按角色目录顺序减去被关闭的 optional 工具；运行期宽松忽略必需工具名与目录外/已下线名称。
- 新 `roleModel` / `workerRole`（`src/app/role-models.ts`）：主 Session←`agents.main` ?? `eval.model`；执行器←`agents.executor` ?? `executor.model`；对齐←`agents.aligner` ?? 执行器有效模型；`mode: 'align'` 的工单判定为 aligner。
- `Sessions`（`src/app/sessions.ts`）：绑定级 `installTools` 安装/撤销工具限制（先装新滤镜再撤旧、可重入排空、首次空集也安装、释放后不复活）；`mainTools` 与 `workOnly` 走同一刷新路径；`limitSubagent` 让子代理共享绑定；`agentsChanged` 遍历全部绑定；`ensure` / `answer` 使用 `roleModel`。
- `Settings.save`（`src/app/settings.ts`）：保存 `agents` 后调用一次 `sessions.agentsChanged()`；不重启、不改 `policyVersion`。
- 自动工具保持自动：主 Session 的压缩工具（billion-context）始终在允许集；计划切片仍获得 `feature_exec_*` 与 pre-run guard，`agents` 保存无法关闭它们。
- `docs/003` 新增 Agent configuration 小节；`docs/007` 更新 Sessions 小节、Modules/Tests 表；新增/扩展 3 个测试文件与 1 个独立复核 lane。

## 冻结验收标准对照

1. 关闭执行器可选工具后：新建执行器看不到它；保存后运行中的执行器及其子代理在下一步失去它；必需工具仍在 —— `tests/runtime.spec.ts`「applies a saved agents block…」（含子代理与新建 Session），非 `agents` 块保存不重装。
2. 主 Session 关闭 `read_image` 后下一步生效，压缩工具仍保留 —— `tests/runtime.spec.ts`「keeps the host's compression tools…」。
3. 计划切片仍自动获得 `feature_exec_*`；对齐 Agent 使用对齐自己的可选集 —— `tests/execution-strategy.spec.ts`「keeps a feature-exec slice's execution tools…」、`tests/agent-config.spec.ts`「applies an aligner's own optional tools…」。
4. 三角色模型覆盖按继承链生效且只对新 Session —— `tests/agent-config.spec.ts`「resolves each role's model…」、`tests/runtime.spec.ts`「seeds each role's model override into new Sessions only…」。
5. 无 `agents` 配置时工具与模型与现在一致 —— `roleTools` 空配置精确等于 `MAIN_TOOLS` / `WORK_TOOLS`，既有精确 allow 断言与 `tests/role-models.spec.ts` 全部保留通过。
6. 指定测试与 typecheck 通过、PR 前 `pnpm check` 全绿、文档已更新 —— 见下。

## 实际跑过的命令（干净 env：`env -u GIT_ASKPASS -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_PAGER -u GIT_TERMINAL_PROMPT -u LANGUAGE LANG=C.UTF-8 LC_ALL=C.UTF-8`）

- `pnpm vitest run tests/agent-config.spec.ts tests/runtime.spec.ts tests/role-models.spec.ts` → exit 0，3 files / **111 tests**
- `pnpm vitest run tests/agent-config.spec.ts tests/runtime.spec.ts tests/role-models.spec.ts tests/execution-strategy.spec.ts` → exit 0，4 files / **126 tests**
- `pnpm typecheck` → exit 0
- `pnpm check` → exit 0（typecheck + **68 files / 1400 tests** + tsdown build 成功）；证据见 `docs/issues/evidence/c2-agents-*.log`
- 宿主 worker shell 注入 `GIT_CONFIG_GLOBAL` / `LANG=zh_CN` 会让 2 个与本次改动无关的既有用例失败，故所有门禁在 clean env 下执行（`benchmarks/agent-config/9464-c2-runtime/environment.md`）。

## 合并与冲突

- 本片依赖 C1（`agents` 配置块与工具目录）：分支先并入 `agent/agent-api-9326a1747b59`（PR #34）。**C1 合入 main 后，本 PR 的 diff 会自动收敛为运行期改动**；在 C1 合并前，本 PR 也携带 C1 的提交。
- 已合并 deployment `main` @ `72b4c4a8`（merge `410f1d0d`）。冲突两处：`docs/issues/benchmark` 符号链接（暂取 main 指向的 C3 案例，e5 再改指本片案例）与 `tests/http.spec.ts`（保留 agents 路由用例与 main 新增的 prepare 路由用例，并去掉重复的 `UserError` import）。

## 风险与限制

- 工具刷新在保存 `agents` 时同步重装滤镜，下一步生效；正在执行的 step 保持它启动时的工具集（DSH 语义）。模型覆盖只影响之后创建的 Session，已运行 Session 保持原模型。
- `limitSubagent` 若首次 `restrict` 抛错会留下无 `tools` 的空 binding：失败时子代理本就不受限（与旧行为一致），`release` 会清理，作为后续 clean-up 候选。
- Q&A answer Session（fork）使用执行器角色的有效模型；不是第四个可配置角色，C3 的面板口径知悉。
- 无 UI 改动（C3 交付面板页与 Before/After 截图）。

Architecture impact: local
