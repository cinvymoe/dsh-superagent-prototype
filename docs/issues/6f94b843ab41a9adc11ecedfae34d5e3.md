---
arch_impact: local
pr_status: open
pr_url: https://github.com/cinvymoe/dsh-superagent-prototype/pull/21
pr_arch_impact: local
worktrees: []
---

# S1 · 主 Session 接入 billion-context 压缩工具

- Alignment issue: `q-aa660352`（Discuss 面板已确认对齐；本 slice 只做「主 Session」这一段）
- Slice: `S1`（同一计划的 worker Session 部分由其他 slice/ticket 承接，不在本 slice）
- Source trigger: `43510f4655e24ed3fac6957626fa92c7`（`local:q-aa660352`）
- Flow: execute / scope: shared / product: shared / policy: A1
- Ticket: `6f94b843ab41a9adc11ecedfae34d5e3`
- Run: `run-mwdmt49d-2`（feature-exec execute）

## 需求原文

> dsh-superagent 主 Session 应该开启 billion context 插件，避免上下文过长

背景（来自宿主机事实，不是新增需求）：

- `billion-context`（bili）在 host 上注册 6 个 ACP 全局工具：`compress`、`decompress`、`search_context`、`acp_status`、`acp_cache`、`acp_read_original_image`。
- 主 Session 的 `tools.restrict({ allow })` 白名单只保留 `skill`、`bash`、`read`、`read_image`、`job_output`、`job_list`、`job_kill`，把这 6 个全局工具挡在模型可见工具面之外，bili 因此判定该会话 `surface=off`（日志 `nudge ARMED-SUPPRESSED ... surface=off`），压缩不生效。
- bili 的工具是在插件/proxy 落地后**异步注册**的，可能晚于主 Session 创建；实现不能只在创建 Session 时取一次工具表。
- 约束：不改 bili 本体、不改 profile/preset；未安装 bili 的 profile 行为保持不变（白名单维持原来的 7 个内置工具，且不得因不存在的工具名抛 `unknown global tool`）。

## 验收标准（冻结版）

- 单测：ACP 工具可见时，主 Session 的 restrict allow 列表包含 `compress`、`decompress`、`search_context`、`acp_status`、`acp_cache`、`acp_read_original_image`；不可见时不包含且不抛 `unknown global tool` 错误。
- 单测：模拟 bili 工具在主 Session 创建之后注册，主 Session 仍能获得这些工具（不能只在创建时取一次工具表）。
- 现有 runtime 与 bundle-patch 测试、`pnpm typecheck && pnpm test && pnpm build` 全部通过。
- `docs/007-architecture.md` 的 Main Session tools 段更新，说明宿主提供 billion-context 压缩工具时会纳入。
- 部署后手动验证记录：重启宿主新开 orchestrator 会话，请求工具面包含 `compress`；`/__bili/sessions` 中该会话 blocks>0；bili 日志不再出现该会话 `nudge ARMED-SUPPRESSED ... surface=off`。

## 任务拆解

- **T1（本 slice，唯一实施任务）**：在 `src/app/sessions.ts` 把主 Session 的 restrict 白名单改为「7 个内置工具 + 宿主可见的 bili 压缩工具」，并订阅 `tools/change` 在工具注册/注销后重算白名单（先释放旧 restrict 再注册新 restrict，避免两次 restrict 取交集）；`tests/runtime.spec.ts` 补两条单测；`docs/007-architecture.md` 更新 Main Session tools 段；跑 `pnpm typecheck && pnpm test && pnpm build`。
- **不在本次**：worker Session 的工具面（其他 slice）、bili 插件本身、profile/preset 配置、部署合并与线上重启（PR 由人复核合并，合并后按上面最后一条做部署手工验证并回填）。

## 设计要点（实现约束）

- 白名单基础项保持现状：`skill, bash, read, read_image, job_output, job_list, job_kill`（七个内置是强制项：宿主缺一个则装饰失败并点名缺项，等价于改动前 `restrict` 直接抛错）；bili 项只在 `agent.ctx.tools.get(name, scopeParentOf(agent))` 可见时加入（读 preset/父作用域视图，绕过本 Session 自己的 restrict 掩码；与 `workOnly` 现有读法一致）。
- 动态性用 `tools/change` 事件（host ctx 注册；DSH 的 `tools/change` 是全局未过滤通知）重算；只有 allow 集合变化时才重建 restriction。
- 重建顺序是 **install-before-lift**（`restrict(newAllow)` 成功后再 `previous()` 释放旧 restriction）：DSH 的 `restrict` 校验用 pre-restriction 名字，旧过滤生效时安装新过滤不会因被掩码的名字抛错；过滤是交集语义，安装后到释放前的生效窗口 = 旧∩新 ⊆ 新，只会更窄，且安装失败时旧 restriction 仍在（fail-closed），不需要恢复机制。
- 重算自身会触发 `tools/change`（安装与释放都会同步通知），用 `applying` 标记 + `pending` 排空处理重入，allow 未变化即返回避免循环。
- 不引入新的公共 API、schema 或配置键；不动 bili。

> 修订记录（2026-11-12）：初版设计要点写的「必须先释放旧 restriction 再安装新 restriction」在 Standards 轴评审中被指出会开出无限制窗口、安装失败时可能完全没有白名单；实现改为 install-before-lift（见上）。冻结的验收标准未变。

## 证据与记录（随执行回填）

- Pull request: https://github.com/cinvymoe/dsh-superagent-prototype/pull/21 （open，待人工复核合并；未启用 auto-merge）
- 评审与测试证据：`docs/issues/review-S1-billion-context.md`（双轴评审由独立 lane R1/R2 承载，测试证据由独立 lane V1 采集）。
- 原始日志（均在修复后的最终树上重生成，源码 mtime 早于全部日志）：`docs/issues/evidence/s1-targeted.log`（2 files / 97 tests，exit 0）、`s1-typecheck.log`（exit 0）、`s1-test.log`（63 files / 1288 tests，exit 0）、`s1-build.log`（Build complete，exit 0）、`s1-baseline-env.log`（环境噪声基线对照，exit 1，仅两条 `GIT_CONFIG_GLOBAL` 环境断言失败）。
- 执行 lane：T1 实施 `lane-T1-1`（child `e0b611df`，含一次评审发现的重建失败重试修复）；R1 `lane-R1-2`；R2 `lane-R2-3`；V1 `lane-V1-5`（首次 `lane-V1-4` 派发异常失败，重派后完成）。
- 机器门说明：本机 feature-exec 构建的 run facts 恒为空（`updateFacts` 无调用方），`review-two-axis` / `arch-impact-decided` 读不到 `review.md`/frontmatter，按 A1 以 agent-attested 门签名并附证据。
- 待复核（owner）：AC-5 部署后手工验证——重启宿主新开 orchestrator 会话，工具面含 `compress`；`/__bili/sessions` 该会话 `blocks>0`；bili 日志无该会话 `nudge ARMED-SUPPRESSED ... surface=off`。结果回填本节。
