# Attempt log

| # | 动作与假设 | 预期 | 实际失败信号 | 失败原因分类 | 有效修正 |
| --- | --- | --- | --- | --- | --- |
| 1 | 读 `discuss.tsx` / `views/records.ts` / `views/threads.ts`，确认需求详情的关联工单数据形状 | 关联工单行已带会话 id | 无（一次命中） | — | 采用只改视图方案：`ticketSummary().sessionId` 已存在，不加 API/fixture 字段 |
| 2 | 派发 T1 lane（subagent，cwd=本 worktree），按 task contract 做 TDD | 先红后绿 | 红：按钮计数 `[0,0,0]` 期望 `[1,0,1]`；实现后 21/21 通过 | 正常 TDD 迭代 | lane 完成后 worker 复核 diff、复跑定向 41/41 |
| 3 | 直接 `pnpm check` | 全绿 | 3 failed（`tests/environment.spec.ts` 1、`tests/runtime.spec.ts` 2） | 宿主环境变量：`GIT_CONFIG_GLOBAL` 已设置 + `LANG=zh_CN.UTF-8` 使 git 报错中文化 | 干净环境 `env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm check` → exit 0；并在未改动基线 @`6ed5fded` 同宿主环境复现同样 3 个失败、干净环境基线全过 |
| 4 | 启动 Before 截图服务：`dsh --profile e31c-before web --port 3097 --no-open` | 服务监听 3097 | `error: too many arguments. Expected 0 arguments but got 1: web.` | 误用子命令：指定 profile 后不再有 `web` 子命令 | 改为 `dsh --profile e31c-before --no-open` |
| 5 | 两个 profile 共用同一个 seeded stateDir | 两侧同时可读同一数据 | 第二个实例 `Error: Lock file is already being held`，orchestrator 未激活，页面无 `.dt-section`（30s 超时） | `proper-lockfile` 对 stateDir 互斥 | 给两侧各 seed 一个独立 stateDir（内容相同） |
| 6 | 直接 `#dt-page` 整页截图（未收侧栏） | Before/After 只差按钮 | 两次截图的侧栏工作区展开状态不同，整页图像不一致 | 页面外围 UI 状态未固定 | 截图前点击 `button[aria-label="收起侧边栏"]`，两侧统一为折叠态 |
| 7 | 复跑截图并逐行读取关联工单按钮 | Before 0 个、After 2 个 | 无（一次通过） | — | Before `[] / [] / []`；After `[打开 Session] / [] / [打开 Session]` |

结论：下次从第 1 步就能一次做对的关键是「先确认派生字段是否已存在」与「截图两侧独立 stateDir + 折叠侧栏」；出现「页面 30s 无 `.dt-section`」时应立即检查 stateDir 锁，而不是重试等待。
