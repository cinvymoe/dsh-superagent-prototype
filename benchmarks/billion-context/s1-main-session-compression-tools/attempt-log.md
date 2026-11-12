# 试错台账

| # | 尝试 | 失败信号 | 原因 | 修正 |
| --- | --- | --- | --- | --- |
| 1 | 独立测试 lane 首次派发（child `fc4e78d9`） | subagent 开始前异常结束，无任何输出与日志 | 派发/子会话异常（未定位到代码原因） | 重派同一 task 到新 lane（child `5ab36c2a`），完整跑完并落盘证据 |
| 2 | 直接 `pnpm vitest run tests/runtime.spec.ts`（未去环境变量） | 2 failed：`tests/runtime.spec.ts` 两条「不改宿主环境」断言（`expected '/root/.dsh/state/superagent/worker-gitconfig' to be undefined`） | 工单 shell 导出 `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_NOSYSTEM`，测试断言这两个变量未被设置 | 全部证据命令加 `env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM LC_ALL=C LANG=C`；基线对照日志保留该失败以证明是环境噪声 |
| 3 | 首轮评审（Standards 轴） | needs_revision：lift-then-install 会开无限制窗口、安装失败可能完全没有白名单；缺内置工具时 install 吞异常造成 fail-open；`applying` 丢通知；测试无法捕捉交集顺序 | 实现顺序与错误处理设计缺陷，非环境问题 | 改为 install-before-lift（成功后再释放旧过滤）、内置工具缺失大声失败、`pending` 排空重入、fake 同步 `emit` 并断言 `restrict 7 → restrict 13 → release 7`；复审 approve |
| 4 | 修复后第一版证据日志（22:57–22:59） | 日志时间早于修复后的源码（23:11–23:18） | 修复合入后未重跑证据 | 由独立 V1 lane 在冻结树上重生成全部五份日志（23:19–23:21），源码 mtime 均早于日志 |
| 5 | 修复引入内置工具前置校验后跑全量测试 | `tests/fixtures/host.ts`、`tests/model-surface.spec.ts` 的 fake `get: () => undefined` 使 9 个 fixture consumer 装饰失败 | 新的强制内置校验要求 fake host 像真实宿主一样提供 7 个内置工具 | 两个 fake 的 `get` 返回 7 个内置（无其它工具），全量 1288 tests 通过 |
