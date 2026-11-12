# Test environment prerequisites

This case needs no physical device or architecture cross-build. It is a node/vitest plus browser-GUI case.

## Unit / integration tests

- Node 22（`pnpm` 11.7.0），依赖用 `pnpm install --frozen-lockfile` 安装。
- 在工单 worktree 运行。worker shell 会导出 `GIT_CONFIG_GLOBAL`/`GIT_AUTHOR_*` 与本地化 git locale，全量门禁请用：

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

## Panel captures

- 隔离 profile `c1-before` 与 `c1-after` 从既有 `superagent-test` profile 复制；`c1-before` 的 `dsh-superagent` 链接到 `/tmp/c1-before`（`04cb0449` 的 detached worktree，已 `pnpm install` + `pnpm build`），`c1-after` 链接到本工单 worktree（已 `pnpm build`）。
- 两个 profile 各用一次性 stateDir（`/root/.dsh/state/c1-before`、`/root/.dsh/state/c1-after`），端口 3095 / 3096，`node /root/.bun/bin/dsh --profile <name> --no-open` 启动并打印 `http://10.126.126.6:<port>/?token=…`。
- 种子数据通过管理 API 写入（`x-orchestrator-request: 1`）：两个项目（Widgets 带 `/srv/worktrees`、Billing）与四条需求（待对齐、待审阅 3 切片、已确认 2 切片、Billing 待对齐）。线上 `superagent-test` 部署未使用，因此截图不含真实工单或私有飞书内容。
- Headless Chromium：`/usr/bin/chromium`，Playwright Python 驱动，`--no-sandbox`。
- 视口 `1440×1100`，locale `zh-CN`，浅色主题，两侧同场景。
- 导航：打开打印的 URL → 侧栏 `Superagent` → 项目 chip `Widgets` → 页面页签；after 侧点「新建需求」/「需求列表」，或用 `sessionStorage['dsh-superagent/route']` 直接落到需求详情再点 `Superagent`。

## Evidence paths

- `docs/evidence/c1-requirement-tabs/before-discuss.png`、`after-new-requirement.png`
- `before-discuss.png`（列表同页）、`after-requirements.png`
- `before-detail.png`、`after-detail.png`、`after-detail-back.png`
- `before-list-billing.png`、`after-list-billing.png`
- `before-new-project.png`、`after-new-project.png`
- `after-detail-derived.png`（after-only）