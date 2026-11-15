# C3 · 需求追评与等回答框粘贴图片

需求详情里两个提交人工评论的输入框的 Before/After 截图。两侧使用同一路由、同一视口、主题、语言与时区，以及同一份种子状态
（一个项目及其需求、一条等待回答的工单）；唯一不同的是构建出的 `dsh-superagent`。

## 版本

- **Before**：部署 `main` @ `75bfe730`（含 C1、C2 的粘贴入口，未含 C3）。需求追评框与等回答框都是普通 `textarea`：
  文本框没有图片入口，粘贴事件没有处理路径，提交也只发文字。
- **After**：本工单分支 `agent/pasted-images-on-487708020d2e` @ `d60ea1c0`（截图所用的切片提交；之后合入的 main
  `a917ef86` 未改这两个框的路径）。两个框接上共享的 `PasteImageField`：粘贴或拖入图片、
  缩略图与文件名、数量/类型限制、超过 5 MiB 时降采样；图片落盘在需求自己的目录，按 Trigger 记在需求记录上，
  时间线只在该消息行显示缩略图；Trigger 文本带 `Images:` 绝对路径块，面板隐藏该块。

## 构建

```sh
# Before
rm -rf /tmp/c3-before-src
mkdir -p /tmp/c3-before-src
git archive 75bfe730 | tar -x -C /tmp/c3-before-src
ln -s /data/project/workspace/superagent/pasted-images-on-487708020d2e/node_modules /tmp/c3-before-src/node_modules
cd /tmp/c3-before-src && pnpm build

# After
cd /data/project/workspace/superagent/pasted-images-on-487708020d2e && pnpm build
```

两侧构建均以退出码 0 完成。

## 截图环境

- DSH profiles `paste3-before` 与 `paste3-after`：复制自 `paste-after` 的有效配置（base + web bundle +
  `dsh-feature-exec`），`dsh-superagent` 分别链接到 Before 构建与本工单工作区，`webserver` 分别监听
  `10.126.126.6:3167` 与 `:3168`，状态目录分别为 `/root/.dsh/state/paste3-before` 与 `paste3-after`。
- 两侧状态目录是同一份本地状态快照的副本（需求 `q-e8cc1972` 与一条 waiting/answer 工单），并做同样处理：
  固定该工单的提问、结束其余工单、清空 Thread 的待评估队列与 effect、暂停执行器并关闭 GitHub Source，
  使截图期间没有 Session 运行；两侧记录逐条相同。
- 浏览器：`/usr/bin/chromium`，经 Playwright 驱动；视口 1440×1200、`locale=zh-CN`、浅色、`Asia/Shanghai`、
  device scale 1。表单、等回答卡与时间线按元素裁切；详情图裁切到面板（`x=280`、宽 1160）。
- 两侧操作相同：打开 **Superagent → 需求列表 → 该需求**，在追评框输入同一句文字并派发同一个粘贴事件（剪贴板携带
  640×400 的 `followup.png`）；截图追评框后点击 **发表评论**；再在等回答框输入同一句文字、粘贴一张 480×300 的
  `waiting.png`；截图等回答卡后点击 **提交回答**；最后截取消息时间线最新的两条消息。
- 两张粘贴图均为脚本生成的合成截图，不含真实内容。

## 截图

- `before-followup-form.png`：追评框只有文本框与 **发表评论**，没有图片入口；粘贴事件未被处理，也没有缩略图。
- `after-followup-form.png`：同一个粘贴事件被处理，出现 **选择图片** 入口、格式/数量提示，以及可移除的
  `followup.png` 缩略图；文本框内容没有被文件名污染。
- `before-waiting-form.png`：等回答框只有文本框与 **提交回答**，粘贴后没有缩略图。
- `after-waiting-form.png`：等回答框粘贴后出现 `waiting.png` 缩略图，文本框仍是输入的文字。
- `before-timeline.png`：两次提交后，时间线里两条消息都只有文字，没有任何图片。
- `after-timeline.png`：同一个时间线里，最新的等回答消息只带自己的 `waiting.png`，下一条追评消息只带自己的
  `followup.png`，更早的消息没有图片；`Images:` 绝对路径块没有作为正文显示。
- `before-detail.png`：需求详情中追评框与最新两条消息的整体区域，没有图片入口与缩略图。
- `after-detail.png`：同一区域的整体区域，追评框带 **选择图片**，两条消息各自显示自己的缩略图与文件名。

截图不含凭据或私有内容；种子项目、需求与工单来自本地状态快照，粘贴图为合成的测试图片。
