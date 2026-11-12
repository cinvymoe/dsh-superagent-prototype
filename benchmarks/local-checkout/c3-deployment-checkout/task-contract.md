# Task contract · C3/T1

- Lane `lane-T1-1`（subagent/spawn，T1，medium，cwd `/data/project/workspace/dsh-worktrees/slice-4b2e5405034c`）
- 文件集：`src/app/{checkout,prepare,api,http,runtime}.ts`、`src/client/{deployment,locales}.tsx|ts`、`src/core/errors.ts`、`tests/{prepare,checkout,http}.spec.ts`、`tests/panel-deployment.spec.tsx`、`tests/fixtures/panel-server.ts`、`docs/006`、`docs/007`。
- 契约：`GET deployment/prepare` → `{checkout, chain, repository, available, reasons, running}`；`POST deployment/prepare` → `{merged, head, log}`，400 `prepareUnavailable`/`prepareBusy`/`prepareFailed`。
- 硬约束：只 spawn `scripts/dsh-superagent prepare --repository <repo>`；单飞在第一个 await 前占位；日志 `<stateDir>/prepare/` 0600 保留 10 份；不写检出、不发信号、不重启；链匹配看全部 remote。
- 验证：定向 prepare+checkout、http、panel-deployment、typecheck、docs/class-docs/locales/client/styles、干净环境 `pnpm check`。
