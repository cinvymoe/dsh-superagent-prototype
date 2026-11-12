# 测试环境前置

- 设备 / 架构：无真机、无 GUI、无截图；纯 Node 22 + SQLite（`node:sqlite`）+ vitest（jsdom 仅面板测试用）。
- 物理/逻辑分辨率与方向：不适用（本切片无 UI 改动，PR 不含 Before/After 截图）。
- 干净环境门禁（必须）：宿主 worker shell 会注入 git 与中文 locale 环境变量，会让 3 个既有用例失败，跑全量门前先清掉：

```sh
env -u GIT_ASKPASS -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_PAGER \
    -u GIT_TERMINAL_PROMPT -u LANGUAGE LANG=C.UTF-8 LC_ALL=C.UTF-8 pnpm check
```

- 依赖安装：`pnpm install`（lockfile 未改）。
- 测试数据库：`tests/fixtures/host.ts` 每个用例在临时目录建独立 `orchestrator.sqlite`，无需外部服务。
- 网络：测试全部打桩（`Commands`、`llm.resolveCallConfig`、`subprocess`），不需要 GitHub/Feishu 凭据。
