# S1 回归案例：主 Session 动态纳管 billion-context 压缩工具

- Ticket: `6f94b843ab41a9adc11ecedfae34d5e3`（alignment `q-aa660352` 的 S1 slice）
- Branch: `agent/session-billion-context-6f94b843ab41`
- Base: deployment `main` @ `c68e6e44`
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/21 （OPEN；由人复核合并，未启用 auto-merge）
- Scope: `src/app/sessions.ts` 主 Session 的 `tools.restrict({allow})` 白名单；`tests/runtime.spec.ts` 单测；`tests/fixtures/host.ts` / `tests/model-surface.spec.ts` 的 fake `get` 补齐 7 个内置工具；`docs/007-architecture.md` Main Session tools 段

## 场景

宿主机安装了 billion-context（bili）插件时，它在 host 上全局注册 6 个 ACP 压缩工具（`compress`、`decompress`、`search_context`、`acp_status`、`acp_cache`、`acp_read_original_image`）。dsh-superagent 主 Session 的 restrict 白名单只列了 7 个 DSH 内置工具，于是这 6 个全局工具被掩码，bili 判定该会话 `surface=off`（bili 日志 `nudge ARMED-SUPPRESSED ... surface=off`），主 Session 上下文不再被压缩。bili 的工具是异步注册的，可能晚于主 Session 创建。

本单让主 Session 的 allow 列表按「7 个强制内置 + 当前可见的 bili 工具」计算，并订阅 `tools/change` 重算；重建时先装新过滤再释放旧过滤（DSH 过滤是交集语义，校验用 pre-restriction 名字）。未装 bili 的宿主行为不变。

## Artifacts

| Artifact | Path |
| --- | --- |
| Frozen acceptance criteria / slice record | `docs/issues/6f94b843ab41a9adc11ecedfae34d5e3.md` |
| Two-axis review and criteria evidence | `docs/issues/review-S1-billion-context.md` |
| Raw verification logs | `docs/issues/evidence/s1-targeted.log`、`s1-typecheck.log`、`s1-test.log`、`s1-build.log`、`s1-baseline-env.log` |
| Test environment prerequisites | `environment.md` |
| Attempt log | `attempt-log.md` |

## How to re-run

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM LC_ALL=C LANG=C pnpm vitest run tests/runtime.spec.ts tests/bundle-patch.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM LC_ALL=C LANG=C pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM LC_ALL=C LANG=C pnpm test
pnpm build
```

Expected: 定向 2 files / 97 tests；typecheck 干净；全量 63 files / 1288 tests；build 成功（16 ESM files）。`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM` 必须去掉，否则 `tests/runtime.spec.ts` 的两条「不改宿主环境」断言会失败（见 environment.md）。

关键断言（`tests/runtime.spec.ts`）：

- 无压缩工具时：`restricts.get(masterId)` 只含 7 个内置，重复 `tools/change` 不重建，`mutations` 只有一次 `restrict`。
- 创建后再注册六个工具：断言 `mutations` 顺序为 `restrict 7 → restrict 13 → release 7`（install-before-lift），且再次 `tools/change` 不重建。
- 重建失败（模拟工具注销竞态）：旧 restriction 仍在、通知不抛；下一次 `tools/change` 重试成功并释放旧 restriction。

## 部署后手工验证（本案例的最终判据）

合并并重启宿主后，新开一个 orchestrator 会话：

1. 该会话的请求工具面包含 `compress`（及另外五个 ACP 工具）；
2. `GET /__bili/sessions` 中该会话 `blocks>0`、`tokensSaved` 增长；
3. bili 日志不再出现该会话的 `nudge ARMED-SUPPRESSED ... surface=off`。

结果回填 `docs/issues/6f94b843ab41a9adc11ecedfae34d5e3.md` 的「证据与记录」。
