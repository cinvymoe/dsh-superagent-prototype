# 双轴评审与验收

完整记录（含各 AC 证据、findings 处置与合并时序）：`docs/issues/review-C1-pending-close.md`。两轴均由独立 lane 在 PR #27 上执行（feature-exec dispatch，T2/high），主会话未代评。

## Standards 轴

结论 **approve**，无 must-fix。核验：core 无 I/O 且只 import 自身与 `node:crypto`；sources 不 import app；面板只取 host 侧类型；`planTicketId` 是唯一 id 派生点（`grep -rn "ticket', 'plan" src` 仅 `src/core/ids.ts`，测试里的 raw key 是刻意的 bytes-unchanged guard）；8 条路由全部包 `view()` 且 `Routes` 类型能挡漏包；测试为行为断言、fixture 只有一处派生；文档与代码一致；无冲突标记/凭据泄漏；提交作者与 trailer 正确。

遗留处置（已在 follow-up PR 落地）：007 Tests 表行与 discuss.tsx 模块行补描述；issue 路由数 6→8；中文注释改英文；证据日志行尾空白清理；comments/execution 路由补视图断言；005 新语义补 docs 守卫。

## Spec 轴

结论 **approve**，7 条冻结验收逐条通过：

| AC | 证据 |
| --- | --- |
| 1 未结束 → false、仍「开放」 | `view()` 任一工单缺 `ended` 即 false；confirm/派发后两个 GET false；面板 live 行 开放 + 已确认 |
| 2 全部 ended → true、两种结束方式 | executor `ready` 后仍 false，owner `stopTicket` 后 list+detail true；面板 finished 行 待关闭 + 已确认 |
| 3 关闭/异常不误报 | 关闭只显示已关闭；zero slices / missing ticket / proposed / rejected / unaligned 全 false |
| 4 仅 HTTP 视图、无持久化 | `git grep slicesFinished` 只在视图/客户端/测试/文档；测试断言 `local.get()/list()` 无字段；无 KV/schema diff |
| 5 `pnpm check` + 双语 locale | 全净 check = 64 files / 1324 tests + build exit 0；locales 测试 en/zh 对齐 |
| 6 文档与 docs 测试 | 005 三态段 + 007 模块行；docs（16）+ class-docs（1）通过 |
| 7 同场景 1440×1100 浅色 zh-CN 截图 | PR 描述 Before=934a1f07 / After=6c91a4f7；四图 identify=1440x1100；实看标签符合 |

## 结论

两轴 approve；PR #27 已由 owner 合并（`422a21a4`）。剩余风险：派生按切片逐次查工单（列表未分页）；默认「待处理」过滤看不到「待关闭」；截图为隔离本地面板种子实例。
