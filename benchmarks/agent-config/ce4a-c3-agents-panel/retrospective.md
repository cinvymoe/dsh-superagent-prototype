# 复盘 · C3 面板「智能体」设置页

## 做对了什么

- **依赖先合再开工**：分支先合并已含 C1（PR #34）、C2（PR #40）的 `main` @ `1724811f`，直接消费 `blocks.agents` 与 `agents.roles`，没有重复实现工具目录或继承链。
- **继承口径只有一份**：把 `roleModel` 从 `src/app/role-models.ts` 抽到纯模块 `src/agent-model.ts`，运行期重导出、面板直接引用；再用 `grep -c 'node:' lib/client.js` 证明面板 bundle 没被拉进 host 代码。这是本片最关键的结构决策。
- **复用既有草稿机制**：`useBlockDraft` + `SaveBar` 直接提供 sessionStorage 草稿、三方合并、409 冲突提示；页面只负责渲染与编辑，测试用 409 场景验证「保留草稿 + 显示冲突」而不另造状态机。
- **目录驱动 UI**：工具名与 required/optional 全部来自 `GET settings.agents.roles`，客户端不硬编码工具名；fixture 的 `PUT settings/agents` 也复用 `validateAgentTools`。
- **真实构建的证据**：Before 用 `main@1724811f` 的独立构建、After 用本分支构建，同一 DSH profile、同一 seed、同一视口/主题/语言；截图体现的是真实面板而非 mock。
- **干净环境门禁**：定向、typecheck、全量 `pnpm check`、`git diff --check` 全部落盘；合并 `main` @ `9f6aa875` 后重跑全量（69 files / 1427 tests）再报 ready。

## 可改进

- **交付顺序**：`/usr/local/bin/gh-merge pr merge --auto` 在这个仓库没有必需检查时会立刻合并，PR #42 在 e5 沉淀提交之前就合入了 `main`。结果沉淀只能从同一 ticket 分支再开一个 follow-up PR（纯文档）。下次应在 e5 沉淀完成、所有提交都在分支上之后，再启用 auto-merge；或者先只开 PR、把 auto-merge 留到 e5 之后。
- **截图脚本的迭代成本**：第一次把历史展开按钮写成「保存历史」（实际是「配置历史」），又因为 seed 的 `savedAt` 在未来导致历史显示「6 小时后」；两次都重跑了整条起服务 + 截图链路。写脚本前先从 Before 截图或页面文本确认标签与相对时间。
- **完整功能边界**：执行器模型也会给工单问答的只读 fork 播种（`Sessions.answer` 用 `roleModel('executor')`）；C2 复盘要求在 C3 文案里写清。本片最初漏了这一点，沉淀时在 `agentRoleHint.executor` 与 docs/005 补了一句。后续涉及「一个配置影响多个角色/路径」时，先沿 `roleModel`/`workOnly` 的调用点过一遍全部消费者。
- **测试深度**：历史用例注入 `server.history` 验证渲染，真实保存产生的 diff 由 C1 的 `tests/agent-config.spec.ts` 覆盖；fixture 的 `agentsRequiredTool`/`agentsUnknownTool` 分支 UI 构造不出来，属防御性校验。若后续 panel fixture 增加「构造非法保存」的入口，可补一条面板侧的拒绝用例。

## 下一步

- follow-up PR 记录本回归案例，并把 `docs/issues/benchmark` 指向它；面板文案补充问答 fork 说明。
- 若共享 `Switch` 继续增加属性，考虑在 `tests/controls.spec.tsx` 固定 `disabled` 的可访问性（本片由 `tests/panel-agents.spec.tsx` 间接覆盖）。
- 后续面板设置页可沿用「纯函数上移 + 目录驱动 + 现有草稿」的组合，减少运行期/面板口径漂移。
