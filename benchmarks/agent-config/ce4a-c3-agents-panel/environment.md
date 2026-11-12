# 测试环境前置 · C3

- 设备 / 架构：无真机；Node 22.23.1、pnpm 11.7.0、vitest 4.1.8；面板测试用 jsdom，其余用例纯 Node + `node:sqlite`。
- 依赖安装：`pnpm install --frozen-lockfile`（lockfile 未改）；`lib/`、`node_modules` 均被 `.gitignore` 忽略，`pnpm check` 会重建 `lib/`。
- 清理宿主注入（必须）：本机 worker shell 会注入 `DSH_PROFILE=web`、`GIT_CONFIG_GLOBAL`、`GIT_AUTHOR_*`、`LANG=zh_CN` 等；直接跑全量会出现与改动无关的失败。所有门禁用：

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
    -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C <command>
```

- 面板测试完全打桩：`tests/fixtures/panel-server.ts` 按路由回答假管理 API，`tests/fixtures/panel.tsx` 用 React `createRoot` 挂载 `App`；`server.misuse` 在每个用例后断言为空，`GET settings` 由 fixture 提供 `blocks.agents` 与 `agents.roles`（直接来自 `agentCatalog()`）。不需要真实 host、数据库或网络。
- 面板 bundle 的 host 代码边界：`pnpm build` 后执行 `grep -c 'node:' lib/client.js`，必须为 0；`src/agent-model.ts` 只能有 `import type`。
- 截图环境（需要重拍 Before/After 时）：
  - 浏览器：`/usr/bin/chromium` + Python Playwright（`playwright.sync_api`），视口 1440×1100、`locale='zh-CN'`、`color_scheme='light'`、`timezone_id='Asia/Shanghai'`。
  - 临时 DSH profile：复制一个已装好 base bundles 的 `$DSH_HOME/profiles/<name>`，把 `package.json` 的 `dsh-superagent` 指到待拍构建，`node_modules/dsh-superagent` 做同名软链，`cordis.patch.yml` 改 `webserver.host/port` 与 `dsh-superagent.config.stateDir`。
  - 启动：`env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL dsh --profile <name> --no-open`（`--profile` 之后的参数就是 app 参数，**不要**再写 `web`）。日志里的 `?token=…` URL 用于浏览器信任，不写入任何日志。
  - seed 状态：复制已有可用 `stateDir`（含 GitHub chain 与 setup stub CLI `/tmp/c3-fake-gh`），用 `node:sqlite` 写 `settings-version:<n>` / `settings-revision` / `settings-block-revision:<block>`；`savedAt` 必须早于当前时间，否则历史显示「N 小时后」。
  - 面板在 `#dt-page` 内部滚动，`full_page=True` 不会展开内部滚动区；需要把目标元素 `scroll_into_view_if_needed()` 再截图。
- 基线：deployment `main` @ `1724811f`（C1 PR #34、C2 PR #40 合入后）；After 为 slice 提交 `7cdd183d` 的构建，随后合并 `main` @ `9f6aa875`（只带 docs/benchmarks 与 `tests/docs.spec.ts` 改动，不改 UI 代码）。
