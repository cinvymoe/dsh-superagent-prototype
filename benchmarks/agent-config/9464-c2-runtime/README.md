# 回归案例 · C2 运行时应用 Agent 配置（工具限制与模型覆盖）

- 需求：alignment `q-b03a9391`，ticket `9464d98fa7afacf61979a6554f28557b`，slice C2（`dependsOn: [C1]`）
- 分支：`agent/agent-9464d98fa7af`；基线 deployment `main` @ `72b4c4a8`
- 交付：`agents` 配置在运行期生效——主 Session / 对齐 Agent / 执行器及子代理按角色计算工具允许集，保存后下一步刷新；三角色模型覆盖只在新建 Session 注入

## 案例文件

| 文件 | 内容 |
| --- | --- |
| `requirement.md` | 用户原话、对齐结果、六条冻结验收标准与范围外 |
| `task-contract.md` | 独立复核 lane 的任务契约（目标、允许改动、验证命令、报告格式） |
| `environment.md` | 干净环境门禁、依赖与测试打桩、基线 |
| `review.md` | Standards + Spec 双轴评审结论与证据 |
| `patterns.md` | 可复用模式与坑模式 |
| `retrospective.md` | 做对了什么、可改进项、下一步 |
| `attempt-log.md` | 试错台账（失败信号、原因、有效修正） |
| `evidence/` | 针对性测试、typecheck、`pnpm check` 日志 |

## 关键判据（回归时先看）

1. 执行器关闭可选工具后：新建 Session 的记录允许集不含该工具；保存后运行中的执行器与子代理出现新的允许集；必需工具仍在。
2. 主 Session 的允许集去掉 `read_image` 后，压缩工具仍追加在 allowed 末尾。
3. 计划切片允许集包含全部 `feature_exec_*` 且不受 `agents` 保存影响；对齐工单使用 aligner 的 optional 集。
4. 模型覆盖只进入新建 Session 的 `model/selection`；已运行 Session 没有新事件。
5. 无 `agents` 配置时 `roleTools` 精确等于 `MAIN_TOOLS` / `WORK_TOOLS`，既有 runtime 断言不变。
