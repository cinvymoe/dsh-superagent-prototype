# C2 · 讨论发送框粘贴图片

新讨论对话框与讨论追评框的 Before/After 截图。两侧使用同一路由、同一视口、主题、语言与时区，以及同一份种子状态
（一个项目 Widgets 及其既有讨论）；唯一不同的是构建出的 `dsh-superagent`。

## 版本

- **Before**：部署 `main` @ `41e4829e`（含 C1 的需求描述粘贴，未含 C2）。新讨论与追评框只有普通文本框，粘贴图片没有处理路径。
- **After**：本工单分支 `agent/pasted-images-on-536084bb9315`。两个框接上共享的 `PasteImageField`：粘贴或拖入图片、
  缩略图与文件名、数量/类型限制、超过 5 MiB 时降采样；提交后图片落盘、时间线/正文显示缩略图，纯图消息也可发送。

## 构建

```sh
# Before
rm -rf /tmp/discussion-images-before-src
mkdir -p /tmp/discussion-images-before-src
git archive 41e4829e | tar -x -C /tmp/discussion-images-before-src
ln -s /data/project/workspace/superagent/pasted-images-on-536084bb9315/node_modules /tmp/discussion-images-before-src/node_modules
cd /tmp/discussion-images-before-src && pnpm build

# After
cd /data/project/workspace/superagent/pasted-images-on-536084bb9315 && pnpm build
```

两侧构建均以退出码 0 完成。

## 截图环境

- DSH profiles `paste-before` 与 `paste-after`：复制自 `discussion-delete-after` 的有效配置（base + web bundle +
  `dsh-feature-exec`），`dsh-superagent` 分别链接到 Before 构建与 After 工作区，`webserver` 分别监听
  `10.126.126.6:3165` 与 `:3166`。
- 两侧状态目录各为 `discussion-delete-after` 状态的副本（`/root/.dsh/state/paste-before`、`/root/.dsh/state/paste-after`），
  种子项目、既有讨论完全相同；截图前各自新建一条讨论，不共用记录。
- 浏览器：`/usr/bin/chromium`，经 Playwright 驱动；视口 1440×1400、`locale=zh-CN`、浅色、`Asia/Shanghai`、
  device scale 1。截图裁切到面板（`x=280`、宽 1160）。
- 两侧操作相同：进入 **Superagent → 讨论 → 新建讨论**，输入同一句文字并在文本框上派发同一个粘贴事件（剪贴板携带一张
  640×400 的 PNG 截图）；截图对话框后点击 **发起讨论**，在详情中截图；再在追评框粘贴第二张 480×300 PNG、输入同一句
  文字，截图追评框后点击 **发表评论**，截图消息时间线。

## 截图

- `before-dialog.png`：新讨论对话框只有文本框，粘贴后没有缩略图，也没有图片选择入口。
- `after-dialog.png`：同一个粘贴事件被处理，出现缩略图与文件名 `pasted-screenshot.png`，文本框没有被插入文件名。
- `before-detail.png`：新建的讨论详情只有正文文字，没有图片。
- `after-detail.png`：讨论正文下方显示粘贴截图的缩略图与文件名 `pasted-screenshot.png`。
- `before-followup-form.png`：追评框没有图片入口，粘贴后没有缩略图。
- `after-followup-form.png`：追评框粘贴后出现缩略图与文件名 `follow-up.png`。
- `before-timeline.png`：追评提交后，时间线只有文字消息。
- `after-timeline.png`：追评提交后，只有该条消息的 timeline row 显示缩略图与文件名 `follow-up.png`，正文与更早的消息没有图片。

截图不含凭据或私有内容；种子项目与讨论来自本地测试状态。
