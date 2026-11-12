# 可复用模式

## 成功模式

1. **配置块与运行期应用分片**：C1 只交付 `agents` 数据模型、工具目录（`agent-tools.ts`）与保存校验，明确「不改变运行中 Session」；C2 只做「目录 → DSH 注册」的映射。回归时先确认配置块/schema 未变（`SettingsSchema`、`GET settings`），再走运行期路径；出现「保存后没生效」时优先查 `block === 'agents'` 的刷新接线，而不是工具目录。
2. **保存感知的绑定级刷新**：`Sessions` 在装饰时为每个绑定装一个 `tools` 闭包（`installTools`），`Settings.save('agents')` 调用 `agentsChanged()` 重算。闭包保留三条不变式：先装新滤镜再撤旧（滤镜取交集，先撤会短暂放开）；安装/撤销触发的 `tools/change` 在同一次调用里排空；释放后不再刷新（`disposed`）。新增「保存后下一步生效」类配置时可直接复用这一形状。
3. **自动工具不进目录**：压缩工具与计划切片的 `feature_exec_*` 只由运行期追加（`mainTools` / `workOnly`），不在 `AGENT_TOOLS` 的 required/optional 里。这样「保存无法关闭自动工具」是结构性的，而不是靠校验兜底；测试只需断言被关的可选项消失、`feature_exec_*`/压缩工具仍在。
4. **模型继承链收敛为纯函数**：`roleModel(settings, role)` 一处定义 `main←agents.main ?? eval.model`、`executor←agents.executor ?? executor.model`、`aligner←agents.aligner ?? 执行器有效模型`；「只对新 Session 生效」仍由既有 `initializeRoleModel` 守卫（已有 request header 或 model/selection 就跳过）保证。测试组合：纯函数覆盖继承链 + 假宿主 `model/selection` 事件覆盖接线。
5. **运行期宽松、保存严格**：`turnedOff` 只认当前 optional 集成员，required 工具名与目录外/已下线名称在运行期被忽略；保存仍由 C1 的 `agentsRequiredTool`/`agentsUnknownTool` 拒绝。升级旧数据不会炸，新数据也存不进坏值。
6. **用记录下来的 allow 列表断言工具上限**：`tests/runtime.spec.ts` 的假宿主把每次 `restrict({allow})` 记进 `restricts`，测试直接比对精确列表；不需要模拟真实工具可见性，也不依赖槽位/时序。

## 坑模式

1. **空允许集的首次安装**：`current` 用 `[]` 表示初值时，首次 `allow()` 返回空数组会命中「未变化」分支而完全不安装限制（等于放开全部工具）。用 `undefined` 区分「尚未安装」，首刷必定调用 `restrict`。
2. **释放后的晚到刷新**：disposer 里只清 `binding.tools` 不够，闭包仍可能被全局 `tools/change` 或排空循环调用；必须再加 `disposed` 标志（入口返回 + 循环条件 + disposer 先置位）。
3. **改 `workOnly` 私有签名会破测试 helper**：`tests/execution-strategy.spec.ts` 直接调用 `workOnly(agent, ticket)`，新增 binding 参数与 `store.settings` 后必须同步补上，否则 helper 在运行时炸而不是类型错。
4. **编号文档链接方向**：`docs/003` 不能链接 `docs/006`（`tests/docs.spec.ts` 只允许指向更早编号），需要跨文档说明时写纯文本「006 Deployment」。
5. **宿主 worker shell 注入**：`GIT_CONFIG_GLOBAL`、`LANG=zh_CN` 等变量会让既有 2 个用例失败；全量门禁统一用 `env -u … LANG=C.UTF-8 LC_ALL=C.UTF-8`（见 `environment.md`）。
6. **并行 slice 的依赖合并**：C2 先 fast-forward 并入 C1 分支（PR #34）再实现，避免重复造 schema；PR 在 C1 合并前会携带 C1 提交，C1 合入后合并 main 即自动收敛。合并 main 时注意 `tests/http.spec.ts` 两侧都新增 import 的重复声明与 `docs/issues/benchmark` 符号链接冲突。
