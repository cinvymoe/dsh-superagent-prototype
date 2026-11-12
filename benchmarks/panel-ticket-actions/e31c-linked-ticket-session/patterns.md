# Reusable patterns

## 1. 只读既有派生字段，不新开数据通路

需求详情的 `thread.tickets` 来自服务端 `threadDetail` 的 `ticketLine(...)`，其中已包含 `ticketSummary()` 的 `sessionId`（「有已启动 Assignment 则该工单的 worker session id，否则空串」）。这次没有加 API 字段、没有在客户端从 `assignments` 重算会话，只读 `ticket.sessionId`，因此服务端、API 类型、fixture 形状都不用动。

**信号**：要展示某个「是否已开始」的布尔状态时，先确认 `TicketSummaryView` 是否已派生；已派生就只改视图。

## 2. 条件按钮复用既有组件与容器

```tsx
{ticket.sessionId && <div className="dt-row-actions"><SessionButton variant="outline" sessionId={ticket.sessionId} /></div>}
```

- 复用 `SessionButton`（内部已 `usePanel().openSession` + `notify(errorText)`），不复制按钮逻辑；
- 复用 `.dt-row-actions`（`margin-left: auto` + `pointer-events` 规则），零 CSS 改动即可右对齐；
- 标题仍是独立 `dt-textlink` 按钮，不要把它包进新的可点区域，避免嵌套交互元素。

## 3. 条件渲染的测试断言「逐行计数 + 精确数组」

不只断言「按钮存在」，而是：

```ts
expect(sessionButtons(zh['openSession']).map(buttons => buttons.length)).toEqual([1, 0, 1])
await click(sessionButtons(zh['openSession'])[2]![0]!)
expect(server.opened).toEqual(['worker-t3'])
```

- 逐行计数同时覆盖「有会话显示」与「无会话不显示」；
- `server.opened` 用精确数组证明「只打开该工单的 session」；
- 再点标题后仍断言 `server.opened` 不变，覆盖「标题链接行为不变」。

## 4. 面板截图：独立 profile + 独立 stateDir + 折叠侧栏

- 两侧各一个 profile（复制既有 web profile，只改 `dsh-superagent` 的 link、`webserver.port`、`dsh-superagent.stateDir`）；
- **两侧 stateDir 必须分开**，否则第二个实例 `proper-lockfile` 拿不到锁，orchestrator 不激活；
- 打开带 token 的 URL → 侧栏 `Superagent` → 用 `sessionStorage['dsh-superagent/route']` 直达目标页 → 点 `button[aria-label="收起侧边栏"]` → 再截图，保证 Before/After 只有被验证的改动不同；
- `dsh` 的 profile 语法是 `dsh --profile <name> [app-args]`，**不要**再加 `web` 子命令；profile patch 里的 `webserver.port` 会覆盖命令行 `--port`。

## 5. 宿主环境测试失败的归类方法

本仓测试对 `GIT_CONFIG_GLOBAL`、`GIT_AUTHOR_*`、`LANG` 敏感（git 报错被本地化、worker 环境断言要求未设置）。遇到这类失败：

1. 先看失败是否只涉及环境变量/本地化文案；
2. 用**未改动基线**在**同一宿主环境**复跑同一文件，得到相同失败；
3. 再用干净环境跑基线与本分支，均通过；
4. 把三段日志都放入证据目录，PR 里说明「与本改动无关，原因是宿主环境变量」。
