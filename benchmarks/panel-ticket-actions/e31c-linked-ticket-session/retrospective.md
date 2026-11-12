# Retrospective

## 做得好的

- 先读视图数据形状再动手：需求详情的 `thread.tickets` 已经是 `ticketLine`，`ticketSummary().sessionId` 已按「有已启动 Assignment」派生，切片因此收敛为纯视图改动（1 个组件 + 1 个测试 + 1 行文档），没有 API、fixture、locale 变化。
- 复用既有 `SessionButton` 与 `.dt-row-actions`，零 CSS 改动，Before/After 里按钮在 1440px 下右对齐且不影响标题行。
- 测试用「逐行按钮计数 + `server.opened` 精确数组 + 标题点击后 `opened` 不变」三件套，同时覆盖验收标准的 1/2/3 条。

## 踩过的坑（怎么踩的、怎么修的）

1. **宿主环境变量导致 3 个测试失败**：直接 `pnpm check` 时 `tests/environment.spec.ts`、`tests/runtime.spec.ts` 共 3 例失败。宿主导出了 `GIT_CONFIG_GLOBAL=/root/.dsh/state/superagent/worker-gitconfig` 与 `LANG=zh_CN.UTF-8`，git 的 `bad config` 报错被本地化成中文，且 worker 环境断言要求这些变量未设置。修正：干净环境门禁 + 未改动基线同环境复现（详见 `attempt-log.md` 第 3 条、`evidence/baseline-hostenv.log`）。
2. **`dsh --profile <name> web` 语法错误**：指定 profile 时不再有 `web` 子命令；应为 `dsh --profile <name> [app-args]`。
3. **profile patch 覆盖 `--port`**：复制来的 profile 里 `webserver.port: 3122` 与另一会话的截图服务冲突，命令行 `--port` 不生效（`EADDRINUSE 10.126.126.6:3122`）；必须改 `cordis.patch.yml` 的端口。
4. **两个 profile 共用一个 stateDir 被锁**：第二个实例 `Lock file is already being held`，orchestrator 不激活，Playwright 等 `.dt-section` 30s 超时；改为两侧各 seed 一份相同数据。
5. **截图侧栏状态不一致**：首次整页截图里一侧的 Workspace 展开了、另一侧没有，图像无法直接对照；截图前统一点击「收起侧边栏」。

## 测试环境三问

1. 是否涉及真机 / GUI / 截图？——涉及真实面板 GUI 截图；无物理设备、无架构交叉编译。
2. 截图前是否做旋转 / 方向转换？——没有。视口固定 1440×1100、浅色、zh-CN；额外前置是「两侧独立 stateDir」与「截图前折叠侧边栏」，没有旋转命令。
3. 该前置是否在其他案例出现过？——「隔离 profile + 一次性 stateDir + chromium headless + 1440 宽」在 `benchmarks/requirement-tabs/c1-requirement-tabs`、`benchmarks/project-repo-chains/c3-project-edit`、`benchmarks/project-bar/p1-project-tabs` 均已出现（≥2 案例）。本仓没有共享的截图环境模板/设备表，因此按「单案例留痕 + 升级建议」处理：新增的「独立 stateDir 防锁」与「折叠侧栏保证同一 UI 状态」两条已写入本 case 的 `environment.md` / `patterns.md`，并建议后续抽到仓库级截图说明中；本次不改仓库级 `AGENTS.md`（无对应模板段落）。

## 回流登记

本仓无失败补偿表与工具负面清单登记处，**本特性无回流项**。

## 索引与架构复核

- 本仓没有 `issues/README.md` 索引与 ADR 库；切片状态记录在 `docs/issues/e31c18f685181583474b8abb3739bc6b.md` 的 frontmatter（`pr_status: open`）。
- 架构复核：本仓无 `arch_check.py`，以 `tests/docs.spec.ts`（`docs/007` 模块表/测试表完整性）+ `pnpm check` 作为等价复核，结果 fresh：63 files / 1288 tests passed，`docs.spec.ts` 14/14；`docs/007` 无需新增模块或测试行（无新文件）。
- portfolio：本仓未使用 `/data/project/ARCHITECTURE.md` 体系，**未启用**。

## worktree 回收

- 本切片没有创建额外 git worktree（issue frontmatter `worktrees: []`）；执行现场为宿主分配的 ticket worktree，保留给交付分支。
- 临时截图现场已回收：两个隔离 profile（`e31c-before` / `e31c-after`）、两份一次性 stateDir、`/tmp/e31c-baseline` 基线构建，以及临时捕获脚本/日志均删除；证据副本已随本 case 与 `docs/evidence/e31c-session-buttons/` 入库。

## 待观察

- 若后续多个切片继续在需求详情页增加行内操作，建议把「行内操作按钮的固定顺序/位置」写进 `docs/005-panel.md`，避免每个切片各自决定放置位置。
