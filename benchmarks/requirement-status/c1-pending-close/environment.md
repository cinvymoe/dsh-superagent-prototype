# 测试环境前置

Node 22.23.1 / pnpm 11.7.0，`pnpm install --frozen-lockfile` 已装依赖；本特性只涉及 Web 面板与 Node 服务端，不涉及真机、交叉编译或屏幕旋转。

## Unit / integration（worker 宿主注意）

worker 宿主会导出 `GIT_CONFIG_GLOBAL`、`GIT_CONFIG_NOSYSTEM` 与本地化 git，令 `tests/environment.spec.ts` / `tests/runtime.spec.ts` 中少量与本次无关的断言失败。最终门必须全净：

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL \
  -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

## 面板截图前置（无设备、无旋转）

- **设备档位**：桌面浏览器（Chromium headless，`/usr/bin/chromium --no-sandbox`），逻辑视口 1440×1100，浅色主题，`locale=zh-CN`；**无需旋转**，`identify` 必须显示 `1440x1100`，文字正立即通过方向自检。
- **基线实例（Before）**：deployment main `934a1f07` 的独立 checkout（`git archive` 或 clone 到 `/tmp/c1-close-before2`），`pnpm install --frozen-lockfile && pnpm build`。
- **本分支实例（After）**：本工作树合并 main 后 `pnpm build`。
- **DSH profile**：从现有 web profile 复制 `c1close-before` / `c1close-after`，`package.json` 以 `link:` 指向各自 checkout，`cordis.patch.yml` 设置 `webserver.host: 10.126.126.6`、端口 3131/3132、`dsh-superagent.stateDir` 各自独立；启动 `node /root/.bun/bin/dsh --profile <name> --no-open` 后取打印的 `?token=` URL（token 不落盘）。
- **一次性 SQLite 种子**：`evidence/seed.mjs`（schema 11）向两个 stateDir 写入完全相同的 `kv`/`thread`/`trigger`/`trigger_thread`/`ticket` 行：1 个项目 `p-widgets`、4 条需求（finished-confirmed、live-confirmed、closed-confirmed、unaligned）与 6 条切片工单；finished 的 C1 用 executor/completed、C2 用 human/stopped，live 留一条未结束工单。工单 id 用 `planTicketId` 同一规则（`sha256(JSON.stringify(['ticket','plan',issueId,sliceId]))` 前 32 位）。
- **列表过滤**：main 起需求列表默认「待处理」会隐藏已确认需求，两个实例都必须先点「全部」再截图，否则两侧都会少行、无法同场景比较。
- **Playwright 取证**：Python Playwright + 系统 Chromium；先在 `sessionStorage['dsh-superagent/route']` 写入 `{"route":{"page":"requirements"},"stack":[],"project":"p-widgets"}`，再点侧边栏 `Superagent`；等行数与 Section 计数一致后截 `#dt-page`。标签序列与 URL 说明写进 `evidence/capture-before.log` / `-after.log`。
- 部署实例与真实 GitHub/Feishu 状态不参与截图；临时服务取证后停止（3131/3132 无监听）。

## Evidence paths

- 截图：`docs/evidence/c1-pending-close/{before,after}-{requirements,detail}.png`
- 门禁与子集日志：`docs/issues/evidence/c1-pending-close-{red,targeted,typecheck,build,check,merge-check}.log`
- 种子与捕获日志：`docs/issues/evidence/c1-pending-close-seed.mjs`、`-seed.log`、`-capture-before.log`、`-capture-after.log`
