# Test environment prerequisites

本 case 是 node/vitest + 浏览器面板用例，不需要物理设备或交叉编译。

## Unit / integration tests

- Node 22（`pnpm` 11.7.0），在工单 worktree 内执行；依赖已随 worktree 提供（`pnpm install --frozen-lockfile` 可用）。
- worker/host shell 会导出 `GIT_CONFIG_GLOBAL=/root/.dsh/state/superagent/worker-gitconfig`、`GIT_AUTHOR_*` 以及 `LANG=zh_CN.UTF-8`。为与干净 CI 一致，全量门禁必须用：

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

- 不要并发跑两个 vitest 进程（本 case 与另一 worktree 的 check 并发时曾出现资源竞争型超时；独占运行即可）。

## Panel captures（Before / After）

- 基线构建：`git archive <base> | tar -x -C /tmp/e31c-baseline`，把本 worktree 的 `node_modules` 软链进去后 `pnpm build`；得到 `main` @ `6ed5fded` 的真实面板 bundle。
- After 构建：本 worktree 直接 `pnpm check`（末尾的 build 产出 `lib/`）。
- 两个隔离 DSH profile（从既有 web profile 复制 `cordis.patch.yml` / `cordis.yml` / `pnpm-workspace.yaml` / `package.json`）：
  - `e31c-before`：`dsh-superagent` link `/tmp/e31c-baseline`，`webserver.port: 3097`，`stateDir: /root/.dsh/state/e31c-before-state`；
  - `e31c-after`：`dsh-superagent` link 本 worktree，`webserver.port: 3098`，`stateDir: /root/.dsh/state/e31c-after-state`。
- 启动：`node /root/.bun/bin/dsh --profile <name> --no-open`（注意命令行 `--port` 会被 `cordis.patch.yml` 的 `webserver.port` 覆盖，必须改 patch）。日志打印 `http://10.126.126.6:<port>/?token=…`。
- 两个 stateDir 必须先各自 seed 相同的最小 SQLite（不能共享：`proper-lockfile` 会互斥，第二个实例报 `Lock file is already being held` 且 orchestrator 不启动）。seed 内容见 `attempt-log.md` 第 5 条：`schema=11`、`master-id`、`local-project:p-widgets`、`local-issue:q-export`、`thread local:q-export`（`subscriptions` 含 3 张工单）、3 条 `ticket` 行（2 张有 `startedAt` 的 Assignment）、2 条 trigger 与 `trigger_thread` 索引。
- Headless Chromium：`/usr/bin/chromium` + Playwright Python（`--no-sandbox`），viewport `1440×1100`、locale `zh-CN`、`color_scheme='light'`。
- 导航：打开带 token 的 URL → 侧栏 `Superagent` → 用 `sessionStorage['dsh-superagent/route'] = {route:{page:'requirements', id:'q-export'}, stack:[], project:'p-widgets'}` 直达需求详情 → 收起侧栏（`button[aria-label="收起侧边栏"]`）→ `#dt-page` 截图。
- 未使用线上 `superagent-test` 部署或真实工单/飞书内容；截图完成后删除临时 profile、stateDir 与 `/tmp/e31c-baseline`。
