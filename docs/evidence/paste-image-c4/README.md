# C4 · 工单追问框粘贴图片送达回答模型

需求详情里 **关联工单 → 提问** 输入框的 Before/After 截图。两侧使用同一路由、同一视口、主题、语言与时区，以及同一份种子状态
（同一条需求 `q-e8cc1972` 及其已启动执行会话的切片工单）；唯一不同的是构建出的 `dsh-superagent`。

## 版本

- **Before**：部署 `main` @ `68d7ab58`（含 C1–C3 的粘贴入口，未含 C4）。Ask 框是普通 `textarea`：没有图片入口，
  粘贴事件没有处理路径，提交只发文字。
- **After**：本工单分支 `agent/pasted-images-on-4988278b27e4`。Ask 框接上共享的 `PasteImageField`：粘贴或拖入图片、
  缩略图与文件名、数量/类型限制、超过 5 MiB 时降采样；图片落盘在需求目录并记在问题（`LocalQuestion.images`）上，
  时间线的该问题行显示缩略图。提交时 Host 用 `attachments.saveImages()` 把图片存成持久附件，随 forked Session 的
  user message 以 `{type:'image', attachment}` 内容块交付；若解析出的模型 `inputModalities` 不含 `image`，则改为在
  文本里给绝对路径，并在面板显示“当前模型不能看图”的提示（该分支由 `tests/questions.spec.ts` 与
  `tests/panel-discuss.spec.tsx` 覆盖）。

## 构建

```sh
# Before
mkdir -p /tmp/c4ask-before-src
git archive 68d7ab58 | tar -x -C /tmp/c4ask-before-src
ln -s /data/project/workspace/superagent/pasted-images-on-4988278b27e4/node_modules /tmp/c4ask-before-src/node_modules
cd /tmp/c4ask-before-src && pnpm build

# After
cd /data/project/workspace/superagent/pasted-images-on-4988278b27e4 && pnpm build
```

两侧构建均以退出码 0 完成。

## 截图环境

- DSH profiles `c4ask-before` 与 `c4ask-after`：复制自 `paste3-before`/`paste3-after` 的有效配置（base + web bundle +
  `dsh-feature-exec`），`dsh-superagent` 分别链接到 Before 构建与本工单工作区，`webserver` 分别监听
  `10.126.126.6:3172` 与 `:3173`，状态目录分别为 `/root/.dsh/state/c4ask-before` 与 `c4ask-after`。
- 两侧状态目录是同一份 `paste3-after` 状态快照的副本；为让 Ask 入口出现，把同一张切片工单
  `4988278b…` 的第一个 assignment 标上 `startedAt`。执行器保持暂停、GitHub Source 保持关闭，截图期间没有 Session 运行。
- 浏览器：`/usr/bin/chromium`，经 Playwright 驱动；视口 1440×1200、`locale=zh-CN`、浅色、`Asia/Shanghai`、
  device scale 1。截图按元素裁切（Ask 框、最新问题行）。
- 两侧操作相同：打开 **Superagent → 需求列表 → 该需求**，在 **关联工单** 里点第一张工单的 **提问**，输入同一句
  “这张截图里是哪个页面？”，向文本框派发同一个粘贴事件（剪贴板携带一张脚本生成的 480×300 PNG `ask.png`），
  截图 Ask 框后点 **提交问题**，再截图时间线最新的问题行。

## 截图

- `before-ask-box.png`：Ask 框只有文本框与 **提交问题 / 取消**；粘贴事件没有处理路径，没有缩略图。
- `after-ask-box.png`：同一个粘贴事件被处理，出现 **选择图片** 入口、格式/数量提示，以及可移除的 `ask.png` 缩略图；
  文本框内容没有被文件名污染。
- `before-question-entry.png`：提交后，时间线里的问题行只有文字，没有任何图片。
- `after-question-entry.png`：同一条问题行显示 `ask.png` 的缩略图与文件名/大小；问题仍照常记在需求记录上。

截图不含凭据或私有内容；种子项目、需求与工单来自本地状态快照，粘贴图为脚本生成的合成图片。
