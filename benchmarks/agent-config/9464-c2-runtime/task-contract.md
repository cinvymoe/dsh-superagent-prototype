# Task contract · C2 · 运行时应用 Agent 配置：工具限制与模型覆盖

- Ticket: `9464d98fa7afacf61979a6554f28557b`（issue `q-b03a9391:C2`，flow execute，policy A1）
- Worktree: `/data/project/workspace/dsh-worktrees/agent-9464d98fa7af`
- Branch: `agent/agent-9464d98fa7af`（已并入 C1 依赖 `agent/agent-api-9326a1747b59`，PR #34）
- Slice issue: `docs/issues/9464d98fa7afacf61979a6554f28557b.md`

## 目标（单一）

`Sessions` 在运行期应用已保存的 `agents` 配置：主 Session、对齐 Agent、执行器及其子代理的工具允许集按角色计算，并在保存 `agents` 后于下一步生效；三角色有效模型按继承链只在新建 Session 上注入。实现已落在工作树中，本 lane 做独立复核与加固，不重开需求、不改变验收标准。

## 已实现（复核对象）

- `src/app/agent-tools.ts`：`orderedTools` / `turnedOff` / `roleTools`（目录顺序、只减 optional、宽松忽略必需与已下线名称）。
- `src/app/role-models.ts`：`workerRole`（`mode: 'align'` → aligner，否则 executor）、`roleModel`（main←`agents.main` ?? eval；executor←`agents.executor` ?? executor；aligner←`agents.aligner` ?? executor 有效模型）。
- `src/app/sessions.ts`：`installTools`（安装后提升旧限制、可重入排空 `tools/change`）；`mainTools` 走同一刷新路径并保留压缩工具；`workOnly` 按角色与计划策略计算并附加 `feature_exec_*`；`limitSubagent` 让子代理共享绑定；`agentsChanged` 刷新所有绑定；`ensure`/`answer` 用 `roleModel`。
- `src/app/settings.ts`：保存 `agents` 后调用 `sessions.agentsChanged()`（不改 `policyVersion`、不重启）。
- `docs/003`、`docs/007` 已更新；`tests/agent-config.spec.ts`、`tests/runtime.spec.ts`、`tests/execution-strategy.spec.ts` 已加用例。

## 验收标准（冻结，逐条复核）

1. 关闭执行器可选工具（如 `web_search`）后：新建执行器 Session 看不到它；保存后已在运行的执行器及其子代理在下一步失去它；必需工具仍在。
2. 主 Session 关闭 `read_image` 后下一步生效；存在压缩工具时仍自动保留。
3. 计划切片工单仍自动获得 `feature_exec_*`；对齐 Agent 使用对齐自己的可选集。
4. 模型覆盖按定义生效：主 Session←`agents.main` ?? 评估模型；执行器←`agents.executor` ?? 执行模型；对齐←`agents.aligner` ?? 执行器有效模型。只对新 Session 生效，已运行 Session 保持原模型。
5. 没有 `agents` 配置时，三类 Session 的工具与模型与现在完全一致（回归对照）。
6. `pnpm vitest run tests/agent-config.spec.ts tests/runtime.spec.ts tests/role-models.spec.ts` 与 `pnpm typecheck` 通过；PR 前 `pnpm check` 全绿；`docs/003`、`docs/007` 已更新。

## 环境前置

宿主 worker shell 会注入 git/locale 环境变量，使既有用例失败。所有门禁命令使用干净环境：

```sh
env -u GIT_ASKPASS -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_PAGER \
    -u GIT_TERMINAL_PROMPT -u LANGUAGE LANG=C.UTF-8 LC_ALL=C.UTF-8 <command>
```

`pnpm install --offline --frozen-lockfile` 已执行，`node_modules` 可用。

## 允许改动

- 仅修复复核中发现的、与本切片验收直接相关的缺陷；改动限于 `src/app/{agent-tools,role-models,sessions,settings}.ts`、列出的三个测试文件与 `docs/003`、`docs/007`。
- 不改 `agents` 数据模型 / HTTP 路由（C1）、不碰面板页面（C3）、不改需求、不扩大范围。
- 不提交、不 push、不创建 PR；把改动留在工作树并报告。

## 必须执行的验证

```sh
env ... pnpm vitest run tests/agent-config.spec.ts tests/runtime.spec.ts tests/role-models.spec.ts tests/execution-strategy.spec.ts
env ... pnpm typecheck
env ... pnpm check
```

## 报告格式

- 结论：通过 / 需修改（逐条对应验收 1–6）。
- 命令与结果（退出码、用例数；`pnpm check` 的测试统计与 build 结果）。
- 发现的问题与已做的修复（文件:行、理由），未修复项要说明原因。
- 如果改动文件，给出 `git diff --stat` 与关键 diff 说明。
