# C3 retry two-axis review — worktree-root documentation

- Ticket: `10cf3eb1cf2bd47e97ffc17239529bc4`（`q-94e6e32e:C3`）
- Branch: `agent/worktree-10cf3eb1cf2b`
- Baseline: deployment `main` @ `66604aa`（工单 worktree 先合并该分支；合并后树与 main 一致，再落本切片增量）
- Delta: `docs/003-execution.md`、`docs/005-panel.md`、`docs/006-deployment.md`、`docs/007-architecture.md`、`tests/docs.spec.ts`（+17 / −13，无生产代码）
- 证据：`docs/issues/evidence/c3-*.log`、`docs/issues/evidence/c3-slice.patch`

## Standards 轴

1. **风格一致**：改动沿用文档既有的陈述句风格，键名与路径用反引号，`>` 优先级链只在同一句内替换叙述，没有顺带重排无关段落；`git diff --check` 干净（`docs/issues/evidence/c3-diff-check.log` 为空）。
2. **测试风格**：`tests/docs.spec.ts` 继续使用既有 `prose()` 折叠空白后按句断言的方式，单引号、每个 `it` 一个语义，纯文件读取无异步/环境依赖；新增断言分别覆盖 003/005/006/007，不重复既有完整性断言。
3. **耦合风险（已权衡）**：文档测试断言精确句子，改措辞会让测试失败。这与套件既有做法一致，且每条断言都对应冻结验收标准中的一句，而不是实现细节；接受该耦合，因为它正是"文档与标准一致"的锁。
4. **准确性核对**：`docs/007` 的 `tests/docs.spec.ts` 行新增了本切片断言内容的描述，与测试文件实际内容一致；模块表/测试表完整性由既有自动断言继续保证。

## Spec 轴（逐条对照冻结验收标准）

1. **`docs/003` 优先级 / prepare cwd / 失败与重试**：通过。
   - 优先级：`chosen by priority: the local project's \`worktreeRoot\` > \`executor.directory\` > \`<stateDir>/work\``。
   - prepare cwd：`the prepare command runs once with \`sh\` and the chosen root as its working directory. … The command creates the checkout; it does not choose the root.`
   - 失败与重试：`fails the Ticket with the absolute path and the reason; the launch never creates that root, never creates the Ticket directory under the default root, and never falls back. Fix the root, then retry the Ticket or write on its Thread: preparation runs again.`；默认 `<stateDir>/work` 仍会在缺失时创建。
2. **`docs/005` 面板字段一致**：通过。
   - Discuss 行：Project name、Execution repository (`owner/name`)、可选绝对 `worktreeRoot`（空值沿用 Execution 根目录），与面板占位符/提示（`discuss.projectName` / `discuss.projectRepository` / `discuss.projectWorktreeRoot` 及其 hint）一致。
   - Projects 小节的字段名改为面板实际标签 **Project name** / **Execution repository** / **Worktree root**。
   - Execution 设置：Executor model、concurrent Tickets、Ticket directory root（`executor.directory`；留空 `<stateDir>/work`）、prepare command、blocked commands，与 `executionDirectory` 及其留空提示一致；保留优先级、显式根目录可写性与 prepare cwd 说明。
3. **`docs/006` Execution 步骤与配置键**：通过。
   - 步骤改用同一优先级链，并明确 `The prepare command runs with that root as its working directory; it creates the repository checkout at \`$DSH_SUPERAGENT_DIR\` but does not choose the root.`
   - `executor` 块继续写明 `directory` 为 Ticket directory root、项目 `worktreeRoot` 优先、显式根目录必须已存在/是目录/可写、失败不创建也不回退。
4. **`docs/007` 模块与测试表 + 文档测试**：通过。
   - `src/executor/dsh.ts` 模块行补上 prepare 工作目录；`tests/docs.spec.ts` 行补上本切片断言的描述。
   - `pnpm vitest run tests/docs.spec.ts` → 11 passed（`docs/issues/evidence/c3-docs-spec.log`）；模块表/测试表完整性断言（每个 src 文件、每个 spec 文件都被列出且所列文件存在）继续通过。

## 验证记录

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm vitest run tests/docs.spec.ts` | 1 file / 11 tests passed | `docs/issues/evidence/c3-docs-spec.log` |
| `pnpm typecheck` | exit 0 | `docs/issues/evidence/c3-typecheck.log` |
| `env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm test` | 62 files / 1245 tests passed | `docs/issues/evidence/c3-full-test.log` |
| `git diff --check` | 无输出 | `docs/issues/evidence/c3-diff-check.log` |
| `git diff --stat` | 5 files, +17 / −13 | `docs/issues/evidence/c3-diff-stat.log` |

## 限制与风险

- **文档-only**：无 UI、接口或行为变化，因此 PR 无需 Before/After 截图；本切片不改变面板，只使描述与面板实际字段一致。
- **实现 lane 失败**：`lane-c3-docs-1`（subagent `79428bc7-f258-4541-8d19-c83c2ac523f2`）未产出编辑或结束消息即失败；worker 直接按同一任务契约完成实现与验证（见 `docs/issues/task-contract-C3-retry.md`）。
- **重复 PR**：较早的 C3 尝试 PR #6（`agent/worktree-1e2ca41e46a5`）仍开着，其基于旧 main 的差异会回退 `Clear filters` 的文档说明；本 PR 基于当前 main 且只含本切片增量，建议由人复核时关闭过时的那一个。
- **架构影响**：none（仅文档与文档测试）。
