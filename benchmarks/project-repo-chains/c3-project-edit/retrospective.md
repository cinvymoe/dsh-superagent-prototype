# Retrospective

## 做对了什么

- 先读 C2 的交付物（PR #13 分支）再动手：C3 只需补「编辑」这一条使用路径，没有重做 C2 的服务端链路协调，diff 控制在 10 个文件、约 190 行。
- 把 `NewProjectPage` 重构成 `ProjectFormPage({ edit })` 而不是复制一份编辑页：四个字段、校验提示、提交/取消行为只有一处维护。
- 预填加了 `loaded` 闸门，规避了面板轮询覆盖用户输入的隐患（这类 bug 在手工点几下时几乎发现不了）。
- 面板测试同时断言请求、展示与存储三层，并加一条「反过来编辑另一个项目」，能挡住「硬编码第一个项目」的错误实现。

## 踩过的坑

1. **`openTab` 的类型收窄**：给 Discuss 路由加 `edit` 后，`{ page: tab, id: undefined }` 不再满足联合类型，`tsc` 报错。修法是把 `openTab` 改成对每个 Tab 显式返回字面量路由（`switch`），而不是 `as Route` 强转。
2. **编辑入口用 replace 导致 Back 失效**：最初 `navigate({ page: 'discuss', edit }, true)`，页头 Back 直接跳回更早的页面而不是 Discuss。改为 push。
3. **`docs.spec.ts` 的行文断言是脆弱的**：改 `docs/007` 的模块行措辞会打破既有断言（`create a project with its name, intake and code repositories…`）。要么保留原句，要么同一次提交里同步断言——本切片选择同步改断言并新增编辑相关断言。
4. **全量 `pnpm check` 与另一个 worktree 的 check 并发**：`tests/followups.spec.ts`（5000 ms 上限）超时一次，单独复跑 16/16 通过。是资源竞争抖动，与改动无关；结论要写进证据日志，不能当成通过。
5. **截图 profile 端口**：`--port 3103` 被 `cordis.patch.yml` 的 `webserver.port: 3095` 覆盖，两个 profile 抢端口。必须改 patch 里的 `port` 与 `stateDir`。

## 下次怎么做更快

- 改 `Route` 联合类型前先 grep 所有构造 Route 的地方（`openTab`、`navigate`、`settingsRoute`），一次性收窄，避免逐个报错。
- 面板新页面先写 `parseRoute` 单测，再写组件测试，最后跑 docs 断言。
- 截图脚本里把「打开侧栏 → 页面 Tab → 项目 Tab」封装成函数；Playwright 的 `get_by_text('Superagent')` 在窄视口会超时（侧栏收起），窄视口截图要单独处理。
