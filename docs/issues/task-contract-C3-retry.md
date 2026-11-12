# C3 retry task contract — worktree-root documentation

- Ticket: `10cf3eb1cf2bd47e97ffc17239529bc4`（`q-94e6e32e:C3`）
- Lane: `lane-c3-docs-1`（subagent / spawn / T1），worktree `/root/.dsh/state/superagent-test/work/worktree-10cf3eb1cf2b`
- 契约目标：按冻结验收标准把 worktree 根目录语义写进 `docs/003`、`docs/005`、`docs/006`、`docs/007`，并让 `tests/docs.spec.ts` 断言这些语义。

## 任务

| 项 | 内容 |
| --- | --- |
| Goal | 文档与文档测试覆盖根目录优先级、prepare 工作目录、显式根目录失败/不回退/可重试、面板字段一致性 |
| Files | `docs/003-execution.md`、`docs/005-panel.md`、`docs/006-deployment.md`、`docs/007-architecture.md`、`tests/docs.spec.ts` |
| 禁止 | 修改 `src/**`、`prompts/**`、locale；提交、push 或开 PR |
| Tier | T1（单模块文档与测试，无跨模块接口） |

## TDD 顺序

1. `tests/docs.spec.ts` 的 `worktree root documentation` 断言按冻结验收标准逐句写成：优先级链 `worktreeRoot > executor.directory > <stateDir>/work`、prepare cwd、失败不回退可重试、docs/005 面板字段、docs/006 配置键、docs/007 表项说明。
2. 四份文档按同一组句子补齐或改写，使断言与标准一致（green）。
3. 断言不是"改测试迁就文档"：每条断言都直接对应冻结验收标准中的一句，文档措辞按标准写，而不是按现有文本写。本次实现与断言在同一遍完成，未单独留档 red 运行。

## 验收映射

1. `docs/003` 优先级链 + prepare cwd + 显式根目录失败不回退、修正后可重试。
2. `docs/005` Discuss（Project name / Execution repository / Worktree root）与 Execution（Ticket directory root = `executor.directory`，留空 `<stateDir>/work`）字段与面板文案一致。
3. `docs/006` Execution 步骤与 `executor` 键说明同语义，明确 prepare 不选根目录。
4. `docs/007` 模块/测试表与实现一致；`pnpm vitest run tests/docs.spec.ts` 通过。

## 验证

- `pnpm vitest run tests/docs.spec.ts`
- `pnpm typecheck`
- `env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm test`
- `git diff --check`；证据写入 `docs/issues/evidence/c3-*.log`。

## 执行限制

`lane-c3-docs-1`（child `79428bc7-f258-4541-8d19-c83c2ac523f2`）在本运行时未产出编辑或结束消息即失败；worker 直接按同一契约完成实现、验证与证据收集，并在 `docs/issues/review-C3-retry.md` 记录该限制。
