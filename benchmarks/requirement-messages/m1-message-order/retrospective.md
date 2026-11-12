# Retrospective

## 发生了什么

- 单文件比较器翻转 + 表单前移即可满足需求；真正需要思考的是 fixture 与宿主语义是否一致。
- `lane-T1-1` 启动即失败（无收尾消息、未改工作区），与 C2 切片同型；worker 按既有先例在同一契约下直接实施，未重试派发。

## 踩到的坑

1. **fixture 把评论写进 `issue.body`。** 详情页用 `issue.body` 与原始 Trigger 文本比对来剔除原始描述；fixture 追加评论后原始描述重新出现在时间线，且页面出现两次。修 fixture（对齐宿主 `LocalIssues.comment`），不要在组件里加特判。
2. **`dsh --profile <name> web` 不是合法调用。** launcher 形如 `dsh --profile <name> [app-args...]`，多写 `web` 会报 `too many arguments`；正确是 `dsh --profile m1-before --host ... --port ... --no-open`。
3. **新 profile 首启会弹「预览版说明」模态**，其遮罩 `intercepts pointer events`，Playwright 点侧栏会一直重试。补 `ui-settings-general.welcomeNoticeVersion` 或在截图前关闭弹窗。
4. **面板滚动在内部容器里**，`full_page=True` 截图仍是单屏；把视口调到 1440×1500 才能在一张图里看到全部消息与输入框位置。
5. **`textarea` 的 placeholder 不在 `inner_text` 里**，用它做渲染断言会误报「comment box missing」；应查 `textarea[placeholder=...]` 元素是否存在。

## 可复用结论

- 顺序类 UI 改动的验收证据 = 「渲染文本序列」+「`compareDocumentPosition` 关系」+「真实面板 before/after 同一场景截图」，三者互不替代。
- 面板 fixture 的写路径必须逐条对齐宿主（改了 `updatedAt`？追加了 Trigger？动了 body？），否则面板测试会在假世界里自洽、在真实世界里错误。
- 隔离 profile 截图配方（worktree 基线构建 + 最小 profile + 种子 SQLite + Playwright + 系统 chromium）已固化到 `environment.md`，下一次 UI 切片可直接复用。
