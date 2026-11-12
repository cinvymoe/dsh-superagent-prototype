# Task contract · C3/T1 — 运行中的检出与「拉取并构建」

- Ticket: `4b2e5405034cd590e0de80c3f261847a`
- Slice: `C3`（alignment `q-3603edff`）
- Lane: `lane-T1-1`（executor=subagent/spawn，tier T1，effort medium，cwd `/data/project/workspace/dsh-worktrees/slice-4b2e5405034c`）
- Issue: `docs/issues/4b2e5405034cd590e0de80c3f261847a.md`（冻结验收标准与避坑清单以该文件为准）
- 依赖：C1（`GET deployment/checkout`，已 merge 到本分支 `d2a6ede1`）、C2（`scripts/dsh-superagent prepare`，已合入 main）

## Goal

Deployment 页只读展示运行中的检出（路径、分支、短 HEAD + 提交时间、脏状态、匹配链仓库），并在确认后经管理路由调用服务脚本的 `prepare` 完成「拉取并构建」；合入只更新本地检出，不重启、不发送任何信号，重启生效由人完成。失败时页面保留并展示脚本文本与日志路径。

## Files

`src/app/checkout.ts`、`src/app/prepare.ts`(新)、`src/app/api.ts`、`src/app/http.ts`、`src/app/runtime.ts`、`src/client/deployment.tsx`、`src/client/locales.ts`、`src/core/errors.ts`、`tests/prepare.spec.ts`(新)、`tests/checkout.spec.ts`、`tests/http.spec.ts`、`tests/panel-deployment.spec.tsx`、`tests/fixtures/panel-server.ts`、`docs/006-deployment.md`、`docs/007-architecture.md`。

## 接口

- `GET deployment/prepare` → `PrepareStatus { checkout, chain, repository, available, reasons, running }`；`checkout` 是 C1 的 `CheckoutView` 加 `committedAt`、`remotes`。
- `POST deployment/prepare`（无 body）→ `{ merged, head, log }`；不可用 400 `prepareUnavailable`、并发 400 `prepareBusy`、脚本失败 400 `prepareFailed`（`values.message`、`values.log`）。
- 路由不调用 restart/exit、不发 SIGTERM/SIGINT、不写 Settings、不碰 Ticket。

## 硬约束

- 服务脚本是唯一写入者：只 spawn `scripts/dsh-superagent prepare --repository <matched>`，不自己 `git`/`pnpm`。
- 单飞在第一个 `await` 前占位；日志写 `<stateDir>/prepare/`（0600，保留 10 份），绝不写进检出。
- 匹配链仓库必须看全部 remote（本部署 origin 是上游，部署仓库在 `deployment` remote）。
- 冻结原因码：`checkout.reasons` 不变；`Prepare` 追加 `noChain`、`empty`。
- 中英文案成对且占位符一致；`docs.spec`/`class-docs.spec`/`locales.spec` 全部通过。

## Verify（lane 必须全部执行并回报尾部）

- `pnpm vitest run tests/prepare.spec.ts tests/checkout.spec.ts`
- `pnpm vitest run tests/http.spec.ts`
- `pnpm vitest run tests/panel-deployment.spec.tsx`
- `pnpm typecheck`
- `pnpm vitest run tests/docs.spec.ts tests/class-docs.spec.ts tests/locales.spec.ts tests/client.spec.tsx tests/styles.spec.ts`
- `env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check`

## Done

改动留在工作树（不 commit/push），报告文件清单、命令与测试计数、路由形状、与 issue 的偏差；任一必需检查失败则报失败与输出尾部。
