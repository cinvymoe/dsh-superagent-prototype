# 测试环境前置 · C2

- 设备 / 架构：无真机、无 GUI、无截图；纯 Node 22.23.1 + `node:sqlite` + vitest 4.1.8（jsdom 仅面板测试用）。
- 物理 / 逻辑分辨率与方向：不适用（本切片无 UI 改动，PR 不含 Before/After 截图）。
- 清理宿主注入（必须）：本机 worker shell 会注入 git 与中文 locale 环境变量，直接跑全量会出现与改动无关的 2–3 个失败（`tests/environment.spec.ts`、`tests/runtime.spec.ts` 的 `GIT_CONFIG_GLOBAL` 断言）。所有门禁统一使用：

```sh
env -u GIT_ASKPASS -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_PAGER \
    -u GIT_TERMINAL_PROMPT -u LANGUAGE LANG=C.UTF-8 LC_ALL=C.UTF-8 <command>
```

- 依赖安装：`pnpm install --offline --frozen-lockfile`（lockfile 未改）。
- 测试数据库：每个用例在临时目录建独立 `orchestrator.sqlite`；`tests/fixtures/host.ts` 与 `tests/runtime.spec.ts` 的假宿主全部打桩（`Commands`、`llm.resolveCallConfig`、`subprocess`、`sessionController`、`agentPresets`）。
- 网络 / 凭据：不需要 GitHub / Feishu 凭据；PR 门禁只有本地命令。
- 基线：deployment `main` @ `72b4c4a8`；本分支先并入 C1 分支 `agent/agent-api-9326a1747b59`（PR #34，提供 `agents` 块），再合并 `72b4c4a8`（merge `410f1d0d`）。
