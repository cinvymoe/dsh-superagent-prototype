# 可复用模式

## 成功模式

1. **运行期语义上移成纯模块**：面板与运行期要读同一份「角色有效模型」时，把 `roleModel` 放到只做 `import type` 的 `src/agent-model.ts`，原模块 `export { roleModel }` 重导出；面板引用纯模块而不是 host 模块。验证方式很短：`grep -c 'node:' lib/client.js` 必须为 0。适用于任何「host 计算 + 面板展示」的同源规则。
2. **设置页的最小组合**：`SettingsProvider`（外层 `settings.tsx`）+ `useBlockDraft(block, saved, revision)` + `Fields` + `SaveBar` + `ConfigHistory`。页面只写字段与布局；草稿持久化、三方合并、409 重载、保存栏显隐都是既有的。
3. **目录驱动 UI，不复制常量**：角色、required/optional、预设名全部来自 `GET settings`（服务端 `agentCatalog()`），客户端不出现工具名清单。新增/下线的工具不需要改面板。
4. **结构性约束用原生 `disabled`**：必需工具用 `disabled` 的 `role="switch"`，而不是「点击后忽略」。约束在 DOM 层就成立，测试断言 `disabled` 与 `aria-checked`，比 spy 点击更稳。
5. **稳定测试钩子用 `data-*`**：卡片加 `data-agent-role="main|aligner|executor"`，测试按角色定位，不依赖文案或样式类；文案改动不会碎。
6. **保存顺序由目录决定**：`disabledTools` 保存前按 optional 目录顺序过滤，与点击顺序无关；测试用逆序点击断言结果，保证历史 diff 稳定。
7. **面板切片截图流水线**：独立构建（`git archive <rev>` + `pnpm install --frozen-lockfile && pnpm build`）→ 临时 DSH profile（软链 `dsh-superagent`，改 port/stateDir）→ seed SQLite → `dsh --profile <name> --no-open` → Playwright（固定视口/主题/locale/timezone，token URL）→ 内部滚动区逐段截图 → 停服务。Before/After 只换构建，不换 seed/profile。
8. **报告里写「真实运行的命令 + 计数」**：定向 4 files / 38 tests、全量 69 files / 1427 tests + build；评审和 PR 都能直接引用。

## 坑模式

1. **`dsh --profile <name> web` 会失败**：`--profile` 之后的参数是该 profile app 的参数，写 `web` 会被当成多余位置参数（`too many arguments … got 1: web`）。正确形式是 `dsh --profile <name> [app flags]`。
2. **继承的 `DSH_PROFILE=web`**：worker shell 里已有 `DSH_PROFILE=web`，再传 `--profile` 会报 `select a profile only once`。启动临时 profile 前 `env -u DSH_PROFILE -u DSH_PROFILE_DIR -u DSH_SESSION_ID -u DSH_WEB_URL`。
3. **面板内部滚动**：面板在 `#dt-page` 内滚动，Playwright 的 `full_page=True` 不会展开它；要 `locator.scroll_into_view_if_needed()` 后再截图，否则「执行器并发」「配置历史」落在折叠区外。
4. **seed 的 `savedAt` 要在过去**：写成未来时间会让 `when()` 显示「N 小时后」，截图与历史都不可信。
5. **`gh-merge pr merge --auto` 可能立即合并**：仓库没有必需检查时，auto-merge 在启用瞬间满足条件就合并。沉淀（e5）提交必须已经在分支上再启用；否则只能从同一 ticket 分支开 follow-up PR。
6. **`tests/docs.spec.ts` 的两张表**：新增 `src/**` 文件或 `tests/*.spec.tsx` 必须在同一次提交里补 `docs/007` 的 Modules/Tests 行，否则全量门禁失败。
7. **`tests/panel-settings.spec.tsx` 固定了导航顺序**：新增设置组要同步改它的数组断言。
8. **共享控件改动的边界**：给 `Switch` 加可选属性是向后兼容的；若改为必填或改变 `role`/`aria-checked` 语义，需要先看 `tests/controls.spec.tsx` 与所有调用点。
