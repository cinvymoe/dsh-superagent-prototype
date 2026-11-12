# T1 task contract（单 lane，full）

- Lane: `lane-T1-1`（feature-exec subagent spawn，tier T2 / effort high），cwd `/data/project/workspace/dsh-worktrees/slice-687169eff807`
- 目标：已确认对齐的需求，在全部切片工单结束后，列表行与详情页头状态从「开放」变「待关闭」（英文 Pending close）；判断由服务端读取时派生，经 `slicesFinished` 暴露；需求仍保持 open 并由 owner 手动关闭。

## Files

`src/core/ids.ts`、`src/core/index.ts`、`src/core/evals.ts`、`src/sources/local-format.ts`、`src/app/local.ts`、`src/app/http.ts`、`src/app/api.ts`、`src/client/discuss.tsx`、`src/client/locales.ts`、`tests/local-align.spec.ts`、`tests/fixtures/panel-server.ts`、`tests/panel-discuss.spec.tsx`、`docs/005-panel.md`、`docs/007-architecture.md`、`docs/evidence/c1-pending-close/`

## Frozen implementation decisions

- `planTicketId(issueId, sliceId)` 在 `src/core/ids.ts` 新增并由 `src/core/index.ts` 导出；`evals.acceptPlan` 的工单 id 与 dependsOn 改用它，id 必须与旧值逐字节一致。
- `src/sources/local-format.ts` 新增 `LocalIssueView = LocalIssue & { slicesFinished: boolean }`（仅 HTTP 视图，不落库）。
- `src/app/local.ts` 的 `view(issue)`：alignment 为 confirmed、切片非空、每个切片按 `planTicketId` 取到的工单存在且 `ended` 存在 → true；零切片/缺工单/其它状态 → false；只读，无写入。
- `src/app/http.ts` 的 8 条返回 issue 的 local 路由统一返回视图；`src/app/api.ts` 响应类型同步。
- `src/client/discuss.tsx` 的 `stateTag`：closed → 已关闭；open + slicesFinished → 待关闭（`tone="info"`）；否则开放。对齐标签不变。
- `src/client/locales.ts` 新增 `discuss.pendingClose: ['待关闭', 'Pending close']`。

## Acceptance / verify

- 冻结验收标准 7 条（见 `requirement.md`）全部可证。
- 目标测试：`pnpm vitest run tests/local-align.spec.ts tests/local.spec.ts tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts`。
- 门禁：`env -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check`。
- 证据：`docs/evidence/c1-pending-close/` 四张同场景 Before/After 截图；命令日志在 `docs/issues/evidence/`。
