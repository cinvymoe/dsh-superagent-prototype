# 回归案例 · C3 面板「智能体」设置页（角色模型、工具目录与历史）

- 需求：alignment `q-b03a9391`，ticket `ce4a60f73cc5f35ed716407967979f02`，slice C3（`dependsOn: [C1, C2]`）
- 分支：`agent/slice-ce4a60f73cc5`；基线 deployment `main` @ `1724811f`（C1 PR #34、C2 PR #40 已合入）
- 交付：PR https://github.com/cinvymoe/dsh-superagent-prototype/pull/42（已合并，slice 提交 `7cdd183d`）
- 内容：设置导航新增「智能体」组与页面——主 Session / 对齐 Agent / 执行器三张卡片，角色模型的继承与覆盖、必需/可选工具开关、执行器并发链接、草稿/冲突/历史；双语文案与 docs 005/007

## 案例文件

| 文件 | 内容 |
| --- | --- |
| `requirement.md` | 用户原话、对齐结果、六条冻结验收标准与范围外 |
| `task-contract.md` | 实施 lane 的任务契约（目标、允许改动、验证命令、报告格式） |
| `environment.md` | 干净环境门禁、面板测试打桩、截图环境与 DSH profile 前置 |
| `review.md` | Standards + Spec 双轴评审结论与证据 |
| `patterns.md` | 可复用模式与坑模式 |
| `retrospective.md` | 做对了什么、可改进项、下一步 |
| `attempt-log.md` | 试错台账（失败信号、原因、有效修正） |
| `evidence/` | 定向测试、typecheck、`pnpm check`、Before/After 截图采集日志 |

## 关键判据（回归时先看）

1. 设置导航顺序是 `来源 / 评估 / 执行 / 智能体 / 提示词 / 部署`，重新挂载或保存路由 `settings/agents` 后仍停在智能体组。
2. 三张角色卡片按 `AGENT_ROLES` 顺序渲染（主 Session、对齐 Agent、执行器），页面短句说明子代理继承执行器的可选工具。
3. 角色模型留空时显示继承值，且与运行期 `roleModel` 同源：主 ← `eval.model`；执行器 ← `executor.model`；对齐 ← 执行器覆盖，否则执行器有效模型；覆盖可一键清除。
4. 必需工具是 `disabled` 的原生开关（点击不改草稿），可选工具开关保存出的 `disabledTools` 按目录 optional 顺序排列；`PUT settings/agents` 载荷与 revision 正确。
5. 409 时保留草稿并显示 `saveConflict`；保存栏只在有改动/保存中/失败时出现；历史能渲染 `change.agent*` 的角色/模型/工具变化行。
6. 面板 bundle 不得引入 host 代码：`src/agent-model.ts` 只有 `import type`，`grep -c 'node:' lib/client.js` 必须为 0。
