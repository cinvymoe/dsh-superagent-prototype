# 复盘

## 坑：怎么踩的、怎么修的

1. **PR 冲突（基线漂移）**：实现时基于 `40191e32`，评审期间 main 合入 #19/#22/#23/#24/#25/#26 到 `934a1f07`，PR 立刻变 `CONFLICTING`。修法：fetch main → merge → 只手工解 3 个文件（005 文档、`discuss.tsx`、panel fixture），其余自动合并后人工复核；合并树重跑全净 `pnpm check`（64 文件 / 1324 测试）。下次：PR 一开就定期 fetch main，别拖到评审后。
2. **截图基线过期 + 默认过滤隐藏行**：旧 Before 是 `40191e32`，不是新 PR 的 merge target；同时 main 新增的需求列表默认「待处理」会隐藏已确认需求。修法：Before 重建新 main，After 用合并后 head，两个实例都点「全部」；同种子、同视口、同主题、同语言。下次：截图脚本第一步就切「全部」，并把两侧版本号写进日志与 PR。
3. **宿主重启打断 lane**：e3 期间宿主重启两次，Standards 评审 lane 被停且无结尾消息；更关键的是 owner 在评审完成前合并了 PR #27。修法：每次恢复先核对 worktree/git/PR（发现 PR 已 MERGED，不重复 push/merge），把评审、回归案例与 issue 沉淀改为基于新 main 的 docs-only follow-up PR。下次：评审 lane 输出落盘（partial note）而不是只留在最终消息里；PR 一旦合并，沉淀走 follow-up 分支。
4. **feature_exec 机器门读不到 issue facts**：本部署的常驻进程 cwd 为 `/`，issue carrier 解析不到 `docs/issues/<id>.md`，`review.md`、`frontmatter.arch_impact` 等 machine gate 永远报缺失（文件实际存在）。修法：不造假文件，用 `feature_exec_gate` 的 `by: agent` + 明确 evidence 记录，并在 issue 写明限制。这属于本部署环境坑，已写入 `patterns.md`。

## 测试环境三问

1. **是否涉及真机 / GUI / 截图？设备、架构、屏幕方向？** 涉及 Web 面板截图，但不涉及真机：桌面 Chromium headless、逻辑视口 1440×1100、浅色、zh-CN；无设备架构与物理屏幕方向。
2. **截图前是否旋转？命令与方向？** 不旋转。`identify` 四张图均为 `1440x1100`，文字正立即通过方向自检；没有 `convert -rotate` 步骤，也没有物理帧。
3. **该前置是否在其它案例出现过？** 是。桌面 DSH 面板截图配方已在 `benchmarks/requirement-tabs/c1-requirement-tabs`、`benchmarks/project-repo-chains/c3-project-edit`、`benchmarks/requirement-filter/c1-requirement-filter`（main 已合入）等 ≥2 个案例出现。按升级规则应升级，但共享模板 `feature-exec-assets/templates/test-environment.md` 的「已知设备基线」段是 rust_crane 真机档位示例，本仓库也没有 `AGENTS.md` 设备表，故本次以本案例 `environment.md` 汇总配方并引用既有案例；**升级待办**：为本仓库补一条仓库级「Web 面板截图基线（desktop 1440×1100、浅色、zh-CN、无旋转）」到合适的共享位置（当前没有合适归属，未擅自新建文档）。

## 升级判定

- 单案例留痕：无屏幕旋转，无设备档位；不触发 rust_crane 设备基线升级。
- 仓库级共享：桌面面板取证配方已 ≥2 案例，已在 `patterns.md` 与 `environment.md` 记录，并在本复盘登记「升级待办」；未改动共享模板（避免把桌面配方写进面向真机的段落）。

## 回流登记

- 本特性无回流项：仓库没有失败补偿表/工具负面清单；坑模式已写入本案例 `patterns.md` 与 `attempt-log.md`。

## 下一次从第几步开始能一次做对？

- 实现：一次做对（红→绿，合并树全绿）。
- 交付：第 1 步就固定「PR 基线随时会动」：开 PR 后定期 fetch main；截图脚本固定先切「全部」；评审 lane 的结论要求写入文件而非只在消息里。出现「main 已前进 / PR 变 CONFLICTING / 默认过滤隐藏行」信号时立即停手，先重基线再继续。
