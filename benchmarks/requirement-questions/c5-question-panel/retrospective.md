# 复盘 · C5

## 做得好的

- **先摸清依赖再动手**：开工前确认 C4 尚未合并、`LocalQuestion` 与两条路由只在 `agent/api-engine-62fa6ab64496` 上，于是以 C4 提交为父，避免重复实现宿主语义或发明第二套契约。
- **夹具已就绪**：C4 已在 `tests/fixtures/panel-server.ts` 加了提问路由的机械桩，C5 只写面板用例，未再碰夹具。
- **实现前把契约写死**：lane 的 task-contract 里固定了 9 个 locale key、`ticket` 字段名、`dt-question*` 标记类与「不改宿主文件」边界，lane 一次交付即可用，worker 只做两处 UI 收敛。
- **视觉证据先做基线**：在等 lane 期间先把 Before 树 `git archive` 出来、profile 与 seed 备好，lane 完成后只需 build + 抓 After，证据与代码同步落地。

## 踩过的坑

1. **`dsh web --profile <name>` 不是命令形态**：正确是 `dsh --profile <name> --no-open`；`dsh web` 里的 `web` 是 profile 名。第一次调用直接报 “too many arguments”。
2. **端口被别的 slice 占用**：3141/3142 已有其它 profile 的 host 在听。先用 `ss -ltnp` 查占用再挑 3191/3192。
3. **`pkill -f "profile c5-after"` 会杀掉自己**：命令串本身含该模式，shell 被 SIGTERM。改用 `kill <pid>`（从 `ss -ltnp` 取）。
4. **等待态截不到**：seeded `asked` 记录会在宿主启动时被 `resume()` 重新处理并落 `failed`（demo 无真实 worker 会话），所以截图只覆盖 `answered`/`failed`，`asked` 交给面板用例。
5. **重复的等待文案**：lane 实现里 `asked` 同时渲染状态标签和一段提示文本，同一句「等待回答…」出现两次；评审时删掉提示文本，只留标签。
6. **打开表单后入口仍可见**：lane 版本在表单展开时仍渲染该行的 Ask 按钮，同一行有两个入口；改为 `asking !== ticket.id` 时渲染入口。
7. **`pnpm check` 的环境噪声**：本会话导出了 `GIT_CONFIG_GLOBAL`，导致 `tests/runtime.spec.ts` 两个用例失败；未设 `LC_ALL=C` 时 `tests/environment.spec.ts` 因中文 git 输出失败。用 `env -u … LC_ALL=C` 复跑得到干净的全绿证据，并在评审里写清这是环境相关既有失败。

## 若重来

- 一开始就把「入口条件 = 宿主拒绝条件」「同一行只允许一个表单」写进 task-contract，可以省掉两处返工。
- 截图脚本的滚动直接 `scrollIntoView({block:'start'})`，比 `scroll_into_view_if_needed()` 稳定得多（后者只做最小滚动，画面会停在 section 的尾巴）。
