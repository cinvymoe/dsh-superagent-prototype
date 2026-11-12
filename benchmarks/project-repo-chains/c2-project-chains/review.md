# C2 双轴评审 · 本地项目拥有并隔离自己的仓库链路

- Run: `run-mwd9wu8f-3`（execute，policy A1），issue `q-141a6a1e:C2`
- Ticket: `4e2a92d2a5b4c1485e70aa07b8adfd99`
- 分支：`agent/slice-4e2a92d2a5b4`，基线 deployment `main` @ `afab266e`（含 C1 / PR #11）
- 评审日期：2026-11-12

## 变更范围

16 个已跟踪文件 + 3 个新增文件（产品/测试/文档）：

| 文件 | 变更 |
| --- | --- |
| `src/app/projects.ts`（新） | `Projects`：项目 ↔ GitHub 链路协调层。`create` 校验后先写项目记录、再经 `Settings.save('source:github', …, 'panel')` 追加 `id=项目 id` 的链路，保存失败删除记录；`update` 只替换目标行；`bindLegacy` 只写项目记录 |
| `src/app/local.ts` | `LocalProjectFields`、`projectNameTaken`、`validateProject`（格式/重名/绝对根）、`draftProject`、`putProject`、`patchProject`；旧 `createProject` 行为逐字保留 |
| `src/app/runtime.ts` | 组合 `Projects`；`initialize` 在 setup 前调用一次 `bindLegacy()`；`ticketDeployment` 优先解析项目链路（启动已解析 → 已存配置兜底 → 旧 repository 回退）；`httpHost` 暴露 `projects` |
| `src/app/http.ts`、`src/app/api.ts` | `POST local/projects` 改为 `name/intakeRepository/codeRepository/worktreeRoot?`；新增 `PUT local/projects/:id`（字段全可选，空 body 400） |
| `src/sources/local-format.ts` | `LocalProject` 增加 `chain/intakeRepository/codeRepository`，`repository` 降为旧记录回退；`projectRepositories` 显示 “intake → code” |
| `src/client/projects.tsx` | 创建页两个仓库输入 + 链路提示；More 菜单显示链路 |
| `src/client/discuss.tsx` | 页头与需求详情项目行显示链路 |
| `src/client/locales.ts` | zh/en 成对新增 `discuss.projectIntakeRepository`/`projectCodeRepository`/`projectRepositories` |
| `tests/*`（6 个文件） | 新增 5 个项目链路用例；既有 HTTP/面板用例改两仓库；fixture 增仓库探测应答、PUT 分支与新 `localProjects` 形状 |
| `docs/005-panel.md`、`docs/007-architecture.md`、`tests/docs.spec.ts` | 项目拥有链路、旧记录启动绑定与回退；模块表新增 `src/app/projects.ts`，模块/测试行同步 |
| `docs/evidence/c2-project-chains/` | 同场景、同视口 1440×1100、浅色、zh-CN 的真实面板 Before/After |

## 双轴评审

### Standards 轴

结论：**通过**，无 must-fix。

- **模块边界。** `LocalIssues` 只做项目记录的校验/读写（`src/app/local.ts:47-108`）；项目与 GitHub Source 配置的关联集中在新的 `Projects`（`src/app/projects.ts:18-136`）；HTTP 路由只做 schema 解析并调用协调层（`src/app/http.ts:206-217`）。没有把 settings 写入塞进 Source 或 Store。
- **原子性与失败语义。** `Projects.create` 在写链路前先完成格式/重名校验（`validateProject`），链路保存由 `Settings.save` 在 `store.atomic` 之前跑账号/仓库探测（`src/app/settings.ts:207` 附近），不可读/不可推送抛 `SetupError` → HTTP 400；保存失败删除刚写的项目记录（`projects.ts:56-64`）。`update` 在写记录失败时尽力回滚链路（`projects.ts:99-106`）。验收用例断言失败后项目与 chains 均无变化。
- **只改自己的链路。** `update` 用 `config.chains.map(row => row.id === target ? row : chain)` 替换目标行（`projects.ts:88-91`）；未命中的其他行为原引用，`toEqual` 深度相等成立。
- **兼容旧记录。** `LocalProject.repository` 变为可选回退字段；`ticketDeployment` 对无 `chain` 的项目仍用 `repository` 覆盖两仓库（`runtime.ts:211-226`）；`bindLegacy` 只写项目记录，不写 settings（`projects.ts:111-121`）。旧 `createProject` 未改，`tests/local.spec.ts` 未改仍通过。
- **测试质量。** 断言走 HTTP/运行时行为与存储值，不绑实现：链路追加与既有行逐字段相等、失败无产物、PUT 只动目标行、工单 `execution.chain` 与两个环境变量、启动幂等绑定与未匹配回退。新增 PUT 相对根 400 断言。
- **文档与一致性。** `docs/005` 的 Discuss 页头/项目小节/Sources 小节、`docs/007` 的 Runtime、模块表（新增 `src/app/projects.ts`）、模块/测试行均更新；`tests/docs.spec.ts` 的两条行文断言同步，其余 worktree-root 文档断言保持。
- **范围。** 未改 `GithubConfigSchema`/`normalizeGithubConfig`（C1 已验收）、未改 `DshExecutor`、未新增依赖、未做数据库迁移；`git diff --check` 干净。

### Spec 轴（按冻结验收标准逐条）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | POST 两仓库 + 可选 worktreeRoot 只新增一条 `id=项目 id` 的链路，已有行逐字段不变，项目视图含两仓库 | PASS | `projects.ts:50-64`、`local.ts:83-96`、`http.ts:206-210`；测试「adds only the new project's chain and returns both repositories」：`chains.length + 1`、每个旧行 `toEqual` 快照、新行 `{id, intake, code}`、GET 视图两仓库 |
| 2 | 仓库不可读/不可推送、重名、仓库格式非法 → 400，设置与项目记录都没有失败产物 | PASS | 重名/格式在 `validateProject` 写前抛出（`local.ts:56-70`）；不可读/不可推由 `Settings.save → setup.checkAccounts → resolveDeployment` 在写入前抛 `SetupError`（`settings.ts:207-210`、`deployment.ts:151-170`），HTTP 映射 400（`http.ts:95`）；测试「refuses bad, duplicate, unreadable and unpushable repositories…」四种 400 后项目名列表与 chains 均等于快照 |
| 3 | PUT 只更新该项目链路与元数据；另一项目链路行更新前后深度相等 | PASS | `projects.ts:66-109`、`http.ts:211-217`；测试「updates only the edited project's chain…」：B 行 `toEqual` PUT 前快照且无新增行，A 行进项目名/两仓库；PUT 相对根 400 且链路不变 |
| 4 | 项目工单 `execution.chain` = 项目链路 id，两个 GitHub 仓库环境变量等于该链路的 code/intake | PASS | `runtime.ts:211-226` 返回项目链路部署（`chain` 字段），`executor/dsh.ts:145-153` 写入 Execution；`ticketEnvironment` 走同一部署；测试「executes a project ticket through the project's own chain」断言 `chain === project.id`、`repository/intakeRepository`、`DSH_SUPERAGENT_GITHUB_REPOSITORY`/`..._INTAKE_REPOSITORY` |
| 5 | 只有 repository 的旧项目启动时幂等绑定到 code repository 相同的既有链路；无匹配仍按原 repository 执行，且不改其他链路 | PASS | `projects.ts:111-121`、`runtime.ts:253`；测试「binds a legacy project to the chain its code repository names at startup…」：匹配项目 `chain='default'` 且两仓库来自链路、二次 `bindLegacy` 记录不变、未匹配项目无 chain/两仓库且工单执行原 repository、存储 chains 等于绑定前快照 |
| 6 | `pnpm check` 全绿；`docs/005` 与 `docs/007` 描述项目拥有链路、旧记录回退与启动绑定 | PASS | `docs/issues/evidence/c2-check.log`：63 files / 1257 tests passed，Build complete，exit 0；`docs/005-panel.md` 项目小节/Sources 小节、`docs/007-architecture.md` Runtime 段与模块表已更新；`tests/docs.spec.ts` 11/11 |

## 测试证据

- 定向：`pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/panel-projects.spec.tsx tests/panel-discuss.spec.tsx tests/deployment.spec.ts tests/panel-source.spec.tsx tests/docs.spec.ts` → `docs/issues/evidence/c2-project-chains-targeted.log`（7 files / 73 tests passed）。
- 全量：`env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check` → `docs/issues/evidence/c2-check.log`（63 files / 1257 tests passed，Build complete，exit 0）。
- `pnpm typecheck`：exit 0（含在 check 内）。
- `git diff --check`：干净。
- 说明：首轮 check 与定向套件并发运行时 `tests/tools.spec.ts` 超时一次（5000 ms 上限，正常约 1.1 s）；单独复跑全量通过。属测试资源竞争抖动，与本次改动无关。

## 视觉证据（UI 变更）

同一场景（项目 `Widgets`、worktree root `/srv/worktrees`）、同一视口 1440×1100、浅色、zh-CN；Before = `afab266e` 构建（deployment `main` 基线），After = 本分支 head 构建：

| 场景 | Before | After |
| --- | --- | --- |
| 新建项目页 | `docs/evidence/c2-project-chains/before-project-form.png`（单字段「执行仓库（owner/name）」） | `docs/evidence/c2-project-chains/after-project-form.png`（「接收 Issue 的仓库」「执行代码的仓库」+ 仓库链路提示） |
| Discuss 页头 | `docs/evidence/c2-project-chains/before-discuss-head.png`（`acme/widgets`） | `docs/evidence/c2-project-chains/after-discuss-head.png`（`acme/intake → acme/widgets`） |

两个 profile 使用同一份 SQLite（同一 GitHub chains 与项目 `Widgets`；Before 记录为旧形状 `repository`，After 记录为 `chain` + 两仓库），仅数据形状随版本变化。

## 架构影响

- 本仓库无 `docs/architecture` / `arch_impact.py`；按 `docs/007-architecture.md` 人工复核：新增一个应用层协调模块 `src/app/projects.ts`，依赖方向仍为 app → deployment/sources；无新依赖、无数据库 schema 变更、无迁移；运行时启动多一次幂等的项目记录绑定。
- `Architecture impact: local`。管理 API 新增 `PUT local/projects/:id` 并改变 `POST local/projects` body（本 slice 冻结标准的一部分），面板与测试同步。

## 尝试记录

- 实现 lane `lane-T1-1`（subagent `b47020fc-4e41-4f4b-8235-11881b67b4a3`）：完成模型/API/运行时/面板/测试/文档骨架与自测（6 files / 62 tests；全量仅 docs 模块表 1 失败，原因是新模块未列入 docs/007）。
- Worker 复核后：补 `docs/005`、`docs/007`（Runtime 段、模块表、模块/测试行）与 `tests/docs.spec.ts` 行文断言；修复旧项目 PUT 时未校验新 worktreeRoot 的缺陷（`projects.ts:69-76`）；`chains()` 改为 `safeParse`，避免损坏的已存配置阻断启动；补 PUT 相对根 400 断言；复跑全量与定向。
- 视觉证据：隔离 profile `c2-before`（基线 `afab266e` 构建）与 `c2-after`（本分支构建）各起一个真实 DSH web 服务，同一 SQLite 形状下截取。

## 结论

- Standards：通过；无 must-fix。
- Spec：6/6 条冻结验收标准有可复核证据。
- 建议进入 PR 提交；`Architecture impact: local`，PR 由人复核合并，不启用 auto-merge。