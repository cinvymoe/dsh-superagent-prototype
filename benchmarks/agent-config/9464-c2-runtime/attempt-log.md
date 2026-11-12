# 试错台账 · C2

| # | 失败信号 | 原因 | 有效修正 |
| --- | --- | --- | --- |
| 1 | `pnpm vitest run tests/agent-config.spec.ts tests/runtime.spec.ts tests/role-models.spec.ts` 在宿主环境直跑：2 failed / 103 passed，`runtime.spec.ts` 断言 `process.env.GIT_CONFIG_GLOBAL` 未设置失败 | 宿主 worker shell 注入 `GIT_CONFIG_GLOBAL`、`LANG=zh_CN` 等变量，与改动无关 | 所有门禁统一 `env -u GIT_ASKPASS -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_PAGER -u GIT_TERMINAL_PROMPT -u LANGUAGE LANG=C.UTF-8 LC_ALL=C.UTF-8`，重跑 105/105 通过 |
| 2 | `tests/execution-strategy.spec.ts` 的 `restricted()` 直接调 `workOnly(agent, ticket)`，改签名后崩溃（`binding.tools` 为空、store 无 `settings`） | 本片给 `workOnly` 增加 `binding` 参数并把允许集改为读取 `store.settings()` | 测试 helper 补 `settings: () => SettingsSchema.parse({})` 与第三个参数 `{ disposers: [] }`；允许集断言不变，14 tests 通过 |
| 3 | `tests/docs.spec.ts` 报 `003-execution.md → 006-deployment.md` 违规 | 编号文档只允许链接到更早的编号文档，006 晚于 003 | `docs/003` 改为纯文本引用「006 Deployment」，测试通过 |
| 4 | 复核发现：`installTools` 的 `current` 初值为 `[]`，当允许集为空时首次 `refresh()` 会判定“未变化”而完全不安装限制 | 旧实现无条件 `restrict({allow})`，空集也会全屏蔽；新逻辑漏掉首次空集 | 用 `current: string[] \| undefined` 区分“尚未安装”，首次刷新必定安装（独立复核 lane 确认/修复） |
| 5 | 复核发现：绑定释放后若再有 `tools/change` 触发 `refresh`，可能重新安装限制 | disposer 只清了 `binding.tools`，闭包本身仍可被调用 | `refresh` 增加 `disposed` 标志，释放后直接返回；测试覆盖重建与释放顺序 |
