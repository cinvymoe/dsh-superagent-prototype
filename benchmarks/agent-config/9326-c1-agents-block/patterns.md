# 可复用模式

## 成功模式

1. **设置块“读取宽松 / 保存严格”分层**：`SettingsSchema` 只做形状与有界校验（存量未知工具名可读、升级不炸），严格的目录/必需工具校验只放在 `BLOCKS.<block>.parse`（保存路径）。新增可演进枚举型配置时直接套用。
2. **工具常量集中为单一来源**：把 `MAIN_TOOLS`/`WORK_TOOLS`/`COMPRESSION_TOOLS`/preset 常量收进 `src/app/agent-tools.ts`，`sessions.ts` 改为 import；目录（required/optional）与运行期允许集共享同一份常量，避免两处漂移。
3. **四类拒绝各自归位**：形状错误 → `ZodError`（400 + `issues`）；目录/必需工具 → `UserError('agentsRequiredTool'|'agentsUnknownTool')`；来源限制 → `guard` 里的 `UserError('panelOnlyAgents')`；模型不可用 → `resolveRoleModel` 失败的 `UserError('modelUnavailable', { block: 'agents.<role>' })`。测试分别锚定 HTTP 与 service 层。
4. **历史 diff 对旧快照兜底**：`(settings.agents as AgentsConfig | undefined) ?? AgentsConfigSchema.parse({})`，避免旧 revision 让整个 diff 退化成 `null`（面板会显示“无基线”）。
5. **角色专用 change 码**：每个角色两个码（模型/工具），文案自带角色名，面板 `changeText` 不需要新增 role 字段即可显示，C3 无需改渲染器。

## 坑模式

1. **宿主 git/locale 注入**：worker shell 的 `GIT_CONFIG_GLOBAL`/`LANG=zh_CN` 会让 `tests/environment.spec.ts`（git 错误文本本地化）与 `tests/runtime.spec.ts`（断言 `GIT_CONFIG_GLOBAL` 未设置）3 例失败，与改动无关；全量门前用 `env -u ... LANG=C.UTF-8` 清掉（见 `environment.md`）。
2. **`git commit -m "…`backtick`…"`**：双引号里的反引号会被 shell 执行，提交信息被吞词；改用 `git commit -F -` + 带引号 heredoc（`<<'MSG'`）重写。
3. **宿主 worktree 的 `origin` 不是部署仓库**：本 worktree 的 `origin` 指向另一个仓库（rust_crane），`git fetch origin main` 会拿到无关历史、`merge` 报 “unrelated histories”；比较/合并部署 main 要用 token URL fetch 到 `refs/remotes/target/main`，或直接 `gh pr view --json baseRefOid`。
4. **lane 中断后从部分产物续跑**：先 `git status`/`git diff` 读已落盘的改动，再按任务契约补完，比重新派 lane 快且不丢已通过的类型骨架。
5. **main 合并冲突点在 `sessions.ts` 常量区**：main 新增问答 Session 的 `ANSWER_TOOLS`，与“工具常量搬出 sessions”正面冲突；解决原则是保留 main 的新常量、删除重复的旧常量、其余从 `agent-tools.ts` import。
