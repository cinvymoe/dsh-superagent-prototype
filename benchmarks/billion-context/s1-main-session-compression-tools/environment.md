# 测试环境前置

- 机器/OS：Linux（本机 x86_64），Node 22 + pnpm；DSH 宿主 `dsh web --port 8399`（本工单执行环境）。
- 仓库：worktree `/data/project/workspace/dsh-worktrees/session-billion-context-6f94b843ab41`，分支 `agent/session-billion-context-6f94b843ab41`，基线 deployment `main` @ `c68e6e44`。
- 依赖：`pnpm install --offline --ignore-scripts`（工单 worktree 初始无 `node_modules`，store 命中）。
- 运行测试必须去掉工单 shell 自带的 git 环境变量，并固定 locale：
  `env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM LC_ALL=C LANG=C <command>`
  - 原因：本工单 shell 导出 `GIT_CONFIG_GLOBAL=/root/.dsh/state/superagent/worker-gitconfig` 与 `GIT_CONFIG_NOSYSTEM=1`，`tests/runtime.spec.ts` 有两条断言「不改变宿主环境变量」，会因此失败；`LC_ALL=C` 让 `tests/environment.spec.ts` 的 git 报错文案可匹配。
- billion-context 插件（真实链路验证用）：host 上 `billion-context@0.1.213` 随 web profile 加载，代理 `127.0.0.1:18787`，`GET /__bili/plugin/manifest` 的 `toolNames` 为六个 ACP 工具；单测不依赖它（fake host 模拟全局工具注册）。
- 本单不涉及真机 / GUI / 截图，无方向与旋转前置。
