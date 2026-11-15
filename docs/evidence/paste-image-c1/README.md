# C1 · 需求描述框粘贴图片

需求描述框的 Before/After 截图。两侧使用同一个路由、同一个对话框、同一视口、主题、语言、时区，以及同一份种子状态
（一个项目 Widgets 及其既有需求）；唯一不同的是构建出的 `dsh-superagent`。

## 版本

- **Before**：部署 `main` @ `109db2e7`。需求对话框只有 **选择图片**，描述框没有粘贴处理。
- **After**：本工单分支 `agent/shared-paste-image-77c941e6fac9`。描述框接上共享的图片粘贴字段：
  粘贴或拖入图片、去重、数量/类型限制、超过 5 MiB 时降采样为最长边 2560 的 JPEG 0.9。

## 构建

```sh
# Before
mkdir -p /tmp/paste-before-src
git archive 109db2e7 | tar -x -C /tmp/paste-before-src
ln -s /data/project/workspace/superagent/shared-paste-image-77c941e6fac9/node_modules /tmp/paste-before-src/node_modules
cd /tmp/paste-before-src && pnpm build

# After
cd /data/project/workspace/superagent/shared-paste-image-77c941e6fac9 && pnpm build
```

两侧构建均以退出码 0 完成。

## 截图环境

- DSH profiles `paste-before` 与 `paste-after`：复制自 `discussion-delete-after` 的有效配置（base + web bundle +
  `dsh-feature-exec`），`dsh-superagent` 分别链接到 Before 构建与 After 工作区，`webserver` 分别监听
  `10.126.126.6:3165` 与 `:3166`。
- 两侧状态目录各为 `discussion-delete-after` 状态的副本，并删除 `master-id` 让每侧建立自己的 Master Session；
  种子项目、需求、讨论完全相同。
- 浏览器：`/usr/bin/chromium`，经 Playwright 驱动；视口 1440×1100、`locale=zh-CN`、浅色、`Asia/Shanghai`、
  device scale 1。截图裁切到面板（`x=280`、宽 1160）。
- 两侧操作相同：进入 **Superagent → 需求列表 → 新建需求**，在描述框上派发同一个粘贴事件，剪贴板携带一张
  640×400、无文件名的 PNG（即没有文件名的剪贴板截图）；随后截图。

## 截图

- `before-paste.png`：相同的粘贴事件没有处理路径，描述框保持为空，没有缩略图（事件未被阻止）。
- `after-paste.png`：粘贴后出现缩略图与文件名 `pasted-<timestamp>.png`，描述框仍为空，没有插入文件名字文本。
- `after-downsampled.png`：16.35 MiB 的 PNG 截图在附加前被降采样，界面显示为
  `pasted-<timestamp>.jpg`（最长边 2560、JPEG 0.9），而不是被 5 MiB 限制拒绝。

截图不含凭据或私有内容；种子项目与需求来自本地测试状态。
