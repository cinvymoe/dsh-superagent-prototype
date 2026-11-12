# Test environment prerequisites

本 case 是 node/vitest + 浏览器面板用例，不需要物理设备或交叉编译。

## Unit / integration tests

- Node 22（`pnpm` 11.7.0），在本 worktree 执行 `pnpm install --frozen-lockfile`。
- 宿主可能导出 `GIT_CONFIG_GLOBAL` / `GIT_AUTHOR_*` 与本地化 git locale；为与 CI 一致，全量门用：

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

- 不要并发跑两个 vitest 进程：`tests/tools.spec.ts` 有 5000 ms 单测上限，资源竞争会偶发超时。

## Panel captures (Before / After)

- 两个隔离 DSH profile：`c3edit-before`（链接 `/tmp/c3edit-before`，基线 `afab266e` 的构建）与 `c3edit-after`（链接本 ticket worktree），webserver 端口 3103 / 3104，state dir `/root/.dsh/state/c3edit-before|after`。
- 复制一个已有 web-profile 的 `cordis.patch.yml` / `cordis.yml` / `pnpm-workspace.yaml`，只改 `package.json` 的 `dsh-superagent` link、`webserver.host/port` 与 `dsh-superagent.stateDir`。
- 两侧用同一份最小 SQLite 种子（不用真实 GitHub）：`local-project:p-widgets`、`local-project:p-other` 两条项目记录；`settings-version:*` 内 `sources.github.config.chains` 为对应两条链路，`cli` 指向 `/tmp/c3edit-fake-gh`（对 `api user` 与 `api repos/*` 返回固定 JSON，使保存时的 setup 探测通过）。
- 启动：`node /root/.bun/bin/dsh --profile c3edit-before --no-open`（profile 已含端口）。注意 `--port` CLI 参数会被 cordis.patch.yml 里的 `webserver.port` 覆盖，必须改 patch。
- Headless Chromium：`/usr/bin/chromium` with `--no-sandbox`；viewport `1440x1100`、locale `zh-CN`、`color_scheme='light'`。
- 导航：打开带 token 的 URL → 侧栏 `Superagent` → 页面 Tab `讨论` → 项目 Tab `Widgets`。
- 截图后删除临时 profile 与 state，不指向真实部署状态。
