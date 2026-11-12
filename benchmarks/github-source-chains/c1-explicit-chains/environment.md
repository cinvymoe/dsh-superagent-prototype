# Test environment prerequisites

本案例需要 Node 测试环境与一次真实面板截图，不需要真机或交叉编译。

## Unit / integration tests

- Node 22（pnpm 11.7.0），`pnpm install --frozen-lockfile`。
- 宿主 shell 可能导出 `GIT_CONFIG_GLOBAL` 与本地化 git locale，会让 `tests/runtime.spec.ts` / `tests/environment.spec.ts` 的既有环境敏感断言失败。用干净环境跑：

```sh
env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm check
```

## Panel captures

- 隔离 DSH profiles `c1chain-before` / `c1chain-after`（由既有 web profile 复制，`dsh-superagent` 分别 link 基线 worktree `/tmp/c1-chain-before`（`04cb0449`，`pnpm build`）与本工单 worktree（本分支，`pnpm build`））。
- 两侧各起一个真实 DSH web 服务（127.0.0.1:3097 / 3098，`--no-open`）。
- 同一份 SQLite 状态：通过 before 服务的 `PUT settings/source:github` 写入旧形状配置（`repository=acme/widgets`、`intakeRepository=acme/intake`、`codeRepository=acme/widgets`、`cli=/tmp/c1-chain-fakebin/gh`），再把状态目录复制给 after 服务，保证两侧读到完全相同的数据。
- fake `gh` 只回答 `api user` 与两个仓库的推送/读取探测，供 setup 通过，不接触真实 GitHub 账号。
- 浏览器：`/usr/bin/chromium`（Playwright Python，`--no-sandbox`），视口 1440×1100，locale zh-CN，浅色主题。
- 导航：打开打印的 URL → 侧栏 `Superagent` → 页面 Tab `设置` → 设置分组 `来源`，截取 GitHub 卡（含展开 `高级`）。

## Evidence paths

- `docs/evidence/c1-github-chains/before-source.png`、`before-source-advanced.png`
- `docs/evidence/c1-github-chains/after-source.png`、`after-source-advanced.png`
