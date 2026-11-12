# C4 双轴评审与测试证据 · 合入后让本地检出生效的文档流程

- Run: `run-mwdvyhhy-6`（execute，policy A1），issue `q-3603edff:C4`
- Ticket: `34aa692db47be2161da69571204aa9eb`
- 分支：`agent/slice-34aa692db47b`，起点 deployment `main` @ `72b4c4a8`（C3 PR #38 的合并提交）
- 评审日期：2026-11-12

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `docs/006-deployment.md` | 新增 `### After a merge: make the running version match the checkout`（四步：合并 → `prepare`/面板构建 → 按部署形态重启 → 验证；含输出原文与退出码段，+52 行）；小时检查新增自动生效提示词与「只在动作/失败时汇报」；故障排查新增 4 行 |
| `docs/005-panel.md` | Deployment 段补 **Running checkout** 与 **Pull and build**；不新增 005 → 006 链接（编号文档只链更早编号） |
| `docs/007-architecture.md` | Configuration reload 增「代码与配置不同，重建后的代码需加载它的进程重启」并链接 `[006 Deployment](006-deployment.md)` |
| `tests/docs.spec.ts` | 新增 `local checkout flow documentation` 3 例 / 10 条断言，钉住流程关键句、两种形态与「不重启宿主」、小时检查、`"restartRequired": false` 验证、005/007 交叉引用 |
| `docs/issues/evidence/c4-flow-*.log` | docs、typecheck、全量 `pnpm check` 证据 |
| `docs/issues/34aa692db47be2161da69571204aa9eb.md`、本文件 | 切片记录与双轴评审 |

## Standards 轴

结论：**通过（approve）**。

- **文档分层**：`006` 讲操作流程与命令语义；`005` 只讲面板所见；`007` 讲 reload 边界。没有把实现细节塞进面板文档，也没有在 `006` 重复 `007` 的模块描述。
- **与实现逐条核对**：`prepare` 的两条成功输出与失败语义、`--repository` 必填、`activate` 的三个跳过旗标与四条退出码、面板标签（**Running checkout** / **Pull and build** / **Takes effect after a restart**）、`GET deployment/checkout` 的 `restartRequired`、`POST deployment/prepare` 不重启——都对照 `scripts/dsh-superagent`、`src/app/prepare.ts`、`src/client/deployment.tsx` 核对。
- **发现并修正的一处事实偏差**：作业单引用的跳过行是 `Intentional stop is active; activation is skipped.`，实现实际打印 `Intentional stop is active; activation skipped.`（`scripts/dsh-superagent:426`，`tests/service-script.spec.ts:423` 已钉住）。文档按实现写，不照抄作业单。
- **链接规则**：`006 → 005`、`007 → 006` 均为更早编号；`005` 不加向后的编号链接；`docs.spec` 的编号/链接/模块表/测试表断言全过。
- **可测试性**：新增断言只钉稳定语义句（流程、两种形态、不重启宿主、只报动作/失败、验证结果），不钉排版；句子改动会立即被测试发现。
- **边界**：不改 `src/`、`scripts/`、`prompts/`、`locales`、配置键；无新依赖；`git diff --check` 无输出。
- **体例**：英文文档、既有术语（deployment form、checkout、profile、assignment）一致；步骤用编号列表，命令用既有 fenced code 风格。

## Spec 轴（逐条对照冻结验收标准）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 文档给出从「PR 已合并」到「运行版本 = 磁盘版本」的完整步骤与预期输出，命令参数和退出码与实现一致 | PASS | `docs/006-deployment.md:154` 起四步：合并（无变化）→ `prepare --repository acme/widgets` 或面板 **Pull and build**（`fast-forwarded …`、`up to date …`、两条 `$ pnpm …`、退出 0/1）→ 按形态重启 → `GET deployment/checkout` 验证 `"restartRequired": false`；段末逐条给出 `prepare`/`activate`/`restart` 的退出码 |
| 2 | 明确两种部署形态各自的重启步骤，并明确插件不会自动重启宿主 | PASS | `docs/006-deployment.md:168` 起步骤 3 与 `:170` 的表格：专用 profile `restart --profile superagent` / `activate`（含回滚）；宿主 profile `systemctl restart dsh-web` 示例后等待面板应答；正文「The plugin never restarts the process that loaded it.」与「never point them at a host profile」 |
| 3 | 小时检查段落给出可直接使用的提示词，并说明只在动作/失败时汇报 | PASS | `docs/006-deployment.md:204-210`：第二段提示词含 `activate --only-when-behind --if-idle --respect-stop`、三条跳过行、成功行、退出 2/3 与退出 1/回滚的处理；收尾句「Both prompts report only when a check acted or failed.」 |
| 4 | `tests/docs.spec.ts` 通过，文中无失效链接或未实现的命令 | PASS | `pnpm vitest run tests/docs.spec.ts` → 19 tests passed（+3）；本地链接用例通过；新增命令逐条核对：`prepare`/`activate` 动作与 `--repository`/`--if-idle`/`--only-when-behind`/`--respect-stop`/`--profile` 均在 `scripts/dsh-superagent` 的 choices/参数中，`GET deployment/checkout` 在 `src/app/api.ts`，`systemctl restart dsh-web` 对应当前部署的 systemd 单元，日志 glob 与 `prune_logs` 的命名一致 |

## 测试证据

- 文档：`pnpm vitest run tests/docs.spec.ts` → 1 file / 19 tests passed，exit 0（`docs/issues/evidence/c4-flow-docs.log`）。
- 类型：`pnpm typecheck` → `tsc --noEmit`，exit 0（`docs/issues/evidence/c4-flow-typecheck.log`）。
- 全量：`env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm check` → 67 files / 1385 tests passed，Build complete，exit 0（`docs/issues/evidence/c4-flow-check.log`）。
- 卫生：`git diff --check` 无输出。
- 定向回归由全量覆盖：`tests/service-script.spec.ts`（prepare/activate 输出与退出码）、`tests/prepare.spec.ts`、`tests/panel-deployment.spec.tsx` 均在 67 个文件内通过。

## 评审中修正

1. 初稿把固定句写成冒号后的小写（`…them: a merged…`），与断言不匹配；改为独立句，保留 `A merged pull request changes the repository, not the running process.`
2. 宿主 profile 行原写「this machine's systemd unit」；改为通用表述并给 `systemctl restart dsh-web` 示例，避免把示例误读为所有部署通用。
3. `docs/005` 的「the chain repository that row matches」改为「the matched chain repository」。
4. 按实现修正 intentional-stop 输出（见 Standards 轴）。

## Architecture impact

`none`：只改 `docs/005`、`docs/006`、`docs/007` 与 `tests/docs.spec.ts`；无模块、公共类型、数据、配置键或运行时行为变化。
