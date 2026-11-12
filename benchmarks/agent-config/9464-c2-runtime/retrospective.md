# 复盘 · C2 运行时应用 Agent 配置

## 做对了什么

- **依赖先行**：开工即并入 C1 分支（`agent/agent-api-9326a1747b59`，PR #34），直接复用 `agents` schema、工具目录与保存校验，本片只写运行期映射；两片没有重复实现同一份目录。
- **独立 lane 复核有真实产出**：T2 review lane 逐条核对 6 项验收，并发现两个边界缺陷（空允许集首刷不安装、释放后可能重装滤镜），修复都带回归测试；主会话复跑定向 126 tests、typecheck、全量 68 files / 1400 tests 后确认。
- **证据先行**：定向、typecheck、`pnpm check` 三条日志落盘（含 exit code），先合并 deployment main `72b4c4a8` 再跑最终全量，避免「绿在旧基线」。
- **文档同步**：`docs/003` 新增运行期语义小节，`docs/007` 更新 Sessions、Modules/Tests 表；`tests/docs.spec.ts` 与全量门禁一起验证。

## 可改进

- **先红后绿**：本片先实现再补测试，只有复核阶段的两条边界用例是「先失败后修复」。后续同类配置应用可以先写 allow 列表断言与模型事件断言，保留红日志。
- **`limitSubagent` 的登记顺序**：先登记 binding 再计算 `workOnly`，首次 `restrict` 抛错会留下无 `tools` 的空 binding。行为与旧版一致且 `release` 会清理，未在本片扩大复核面；已登记为后续 clean-up 候选。
- **Q&A fork 的模型口径**：`answer` 使用 `roleModel('executor')`，所以 `agents.executor.model` 也会影响问答 fork。契约已声明、C1 未定义第四个角色，但 C3 面板文案需要写清楚「执行器配置同时作用于问答 fork」。

## 下一步

- C3：面板「智能体」页、目录/中英文案、Before/After 截图；保存走 C1 的 `PUT settings/agents`（panel-only）。
- C1 合并后：合并 main，确认 PR #40 的 diff 收敛为运行期改动，再按仓库流程合并。
- 可选 clean-up：`limitSubagent` 的 binding 登记顺序；`turnedOff` 对重复 `disabledTools` 的归一化（当前按集合判断，无行为影响）。
