# Test environment prerequisites

本 case 是 node/vitest + 浏览器面板用例，不需要物理设备或交叉编译。

## Unit / integration tests

- Node 22（`pnpm` 11.7.0），在本 worktree 执行 `pnpm install --frozen-lockfile`。
- 宿主会导出 `GIT_CONFIG_GLOBAL` / `GIT_AUTHOR_*` 与本地化 git locale，全量门请用：

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

- 不要并发跑两个 vitest 进程：`tests/tools.spec.ts` 有 5000 ms 单测上限，资源竞争会偶发超时。

## Panel captures (Before / After)

- 基线 worktree：`git worktree add --detach /data/project/workspace/dsh-worktrees/m1-before 6ed5fded`，在其中 `pnpm install --frozen-lockfile && pnpm build`；"after" 用本工单 worktree 的构建。
- 两个隔离 DSH profile `m1-before` / `m1-after`：最小 `package.json`（`dsh-superagent` → 对应 worktree，bundles 为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-superagent`）、`cordis.yml`（空列表）、`cordis.patch.yml`（`dsh-superagent.stateDir` 指向 `/root/.dsh/state/m1-before|after`，并写入 `ui-settings-general.welcomeNoticeVersion: 2026-09-28.1` 以抑制首启「预览版说明」弹窗，否则它会拦截点击）、`node_modules/dsh-superagent` 符号链接。
- 启动：`dsh --profile m1-before --host 127.0.0.1 --port 3097 --no-open`（**不要**写成 `dsh --profile m1-before web`，`web` 会被当成多余参数报错）；日志里会打印带 `?token=` 的 URL，访问需带该 token（否则 401）。
- 种子：复制一份已有隔离 state 的 `orchestrator.sqlite`，再用 Python 写入 `kv` 的需求记录、`thread` 记录、3 条 `trigger` + `trigger_thread` 与 1 条 `outbox` 已发送回复（`status: 'sent'` + `sentAt`）。不要用真实部署 state。
- 导航：Playwright（Python 1.64.1，`executable_path='/usr/bin/chromium'`, `--no-sandbox`）打开带 token 的 URL → `page.evaluate` 写入 `sessionStorage['dsh-superagent/route'] = {"route":{"page":"requirements","id":"q-m1demo"},"stack":[],"project":"p-85eb3602"}` → reload → 侧栏点 `Superagent`（`get_by_text('Superagent', exact=True).first`）→ 等 `.dt-page-head`。
- 视口 1440×1500、`locale='zh-CN'`、`color_scheme='light'`；注意面板滚动容器是内部元素，`full_page=True` 不会把列表全部纳入，需要调高视口才能一次看到全部消息。
- 截图后停止服务、删除临时 profile/state/worktree，不指向真实部署状态。
