# Reusable patterns

## 1. 创建/编辑共用一个表单页，用可选 `edit` 参数区分

- 路由用互斥的可选键（`id` / `create` / `edit`）而不是字符串状态，`parseRoute` 里 `edit` 优先于 `create`，`routeLabel` 同步给出返回按钮文案。
- 组件签名 `ProjectFormPage({ edit }: { edit?: string })`：一个 `editing` 布尔贯穿标题、提交方法、按钮文案，避免两份几乎相同的 JSX。
- 提交时按 `editing` 选择 `PUT local/projects/:id` 或 `POST local/projects`；空 `worktreeRoot` 在创建时省略 key（表示「沿用执行目录」），在编辑时发送空字符串（表示「清除已存根目录」）。语义差异来自服务端 PUT 的字段可选性，不要用一个分支糊过去。

## 2. 预填只发生一次，避免轮询覆盖输入

面板每 5 s 轮询 `GET local/projects`。编辑页预填必须加 `loaded` 闸门：

```ts
useEffect(() => {
  if (!editing || loaded || !current) return
  setName(current.name); /* ...其余字段 */
  setLoaded(true)
}, [editing, loaded, current])
```

否则用户打字时列表轮询会重置表单。加载完成前渲染加载提示而不是空表单，避免「闪一下空值再跳变」。

## 3. 面板隔离回归要同时断言三层

只断言「页头显示变了」不足以证明隔离。三条一起断言：

1. 请求层：`PUT` 的 path 只含被编辑项目，body 只含它的四个字段（`putRequests()` 长度 + `toMatchObject`）。
2. 展示层：保存后当前项目页头显示新链路；切到另一个项目后其页头仍是旧链路，且页面上不出现新链路。
3. 存储层：`server.localProjects` 里另一个项目的 `name/intakeRepository/codeRepository/worktreeRoot` 逐字段不变。

再补一条「反过来编辑另一个项目只影响它」，防止实现把「第一个项目」硬编码。

## 4. 编辑入口用历史 push，取消用 replace

- 「编辑项目」按钮 `navigate({ page: 'discuss', edit }, false)`：产生一条历史，页头 Back 才能回到 Discuss（测试里点 `.dt-page-head button` 验证）。
- 保存成功与取消/返回都 `navigate({ page: 'discuss' }, true)`：替换当前条目，不把表单页留在返回栈里。
- 新建页的「新建项目」按钮在编辑态也用 replace，避免 create↔edit 之间堆历史。

## 5. 截图证据的隔离 profile 做法

- 每个 side 一个独立 profile 目录（复制 `cordis.patch.yml` / `cordis.yml` / `pnpm-workspace.yaml`，改 `package.json` 的 link、`webserver.port`、`stateDir`）。
- **`--port` CLI 参数会被 `cordis.patch.yml` 的 `webserver.port` 覆盖**：端口必须改 patch，否则两个 profile 抢同一个端口报 `EADDRINUSE`。
- 用 `cli` 指向一个 fake `gh`（对 `api user` / `api repos/*` 返回固定 JSON），种子 SQLite 里放两条项目与链路，保存时的 setup 探测即可通过，无需真实 GitHub 凭据。
