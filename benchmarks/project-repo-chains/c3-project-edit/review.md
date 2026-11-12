# C3 双轴评审 · 面板按项目创建/编辑两条仓库并展示隔离结果

- Run: `run-mwdbhyee-7`（execute，policy A1），issue `q-141a6a1e:C3`
- Ticket: `7da08cb013a15d3c5238a983664829d0`
- 分支：`agent/slice-7da08cb013a1`；本切片开始时 deployment `main` head = `afab266e`（含 C1 / PR #11）
- 依赖：C2（PR #13，head `df875f01`）提供项目链路 API、四字段创建页与页头/菜单展示；本切片在其分支之上补编辑路径
- 评审日期：2026-11-12

## 变更范围

10 个已跟踪文件（产品/测试/文档）：

| 文件 | 变更 |
| --- | --- |
| `src/client/route.ts` | Discuss 路由增加编辑态 `{ page: 'discuss', edit }`（与 `id`、`create` 互斥）；`parseRoute` 归一化（edit 优先于 create）；`routeLabel` 返回「编辑项目」 |
| `src/client/app.tsx` | `Pages` 编辑态渲染 `ProjectFormPage`；`openTab` 改为每个 Tab 显式返回字面量路由（新联合类型下保持类型安全） |
| `src/client/projects.tsx` | `NewProjectPage` → `ProjectFormPage({ edit? })`：创建/编辑共用四字段；编辑预填一次（`loaded` 闸门）并 `PUT local/projects/:id`；成功 `reloadProjects` + `setProject` + 返回 Discuss；失败通知并留在本页；编辑态「新建项目」按钮用 replace |
| `src/client/discuss.tsx` | Discuss 页头 actions 增加「编辑项目」按钮，push 历史以便 Back 返回 Discuss |
| `src/client/locales.ts` | zh/en 成对新增 `discuss.editProject`、`discuss.saveProject` |
| `tests/panel-projects.spec.tsx` | 新增 3 条面板测试：编辑一个项目不影响另一个项目（请求/展示/存储三层 + 反向再编辑）；400 停留并保留输入、空根清除；Cancel/Back 不发请求。More 菜单行新增两条仓库断言 |
| `tests/navigation.spec.ts` | `parseRoute` 的 create/edit 归一化断言（edit 优先、非法 edit 丢弃） |
| `tests/docs.spec.ts` | 编辑页文档语义断言（同一表单、预填、取消/返回不写、刷新返回、只改本项目、拒绝保留页面），并同步原模块行断言 |
| `docs/005-panel.md` | Discuss 小节写清编辑入口、共用表单、保存后刷新返回、隔离与拒绝行为 |
| `docs/007-architecture.md` | `discuss.tsx`、`projects.tsx`、`route.ts`、`panel-projects` 测试行更新 |
| `docs/evidence/c3-project-edit/` | 同场景、同视口 1440×1100、浅色、zh-CN 的真实面板 Before/After（8 张） |

## 双轴评审

### Standards 轴

结论：**通过**，无 must-fix。

- **模块边界。** 表单纯 UI：没有新增服务端逻辑（C2 已交付 API）；`ProjectFormPage` 只依赖 `usePanel` / `usePanelData` 的既有契约；路由改动限于 `route.ts` 与 `app.tsx` 的渲染分支。
- **表单复用。** 创建与编辑共用同一组件、同一组字段与提交/取消行为；只有 `edit` 是否给出决定标题、按钮文案与 POST/PUT 分支，避免两份 JSX 漂移。
- **预填与状态。** 预填只发生一次（`loaded` 闸门），后续 5 s 项目轮询不会覆盖用户输入；项目列表未到位时显示加载提示而不是空表单；保存失败保留输入。
- **请求语义。** 创建空 `worktreeRoot` 省略 key（沿用执行目录）；编辑始终带 `worktreeRoot`，空字符串表示清除（与服务端 `Projects.update` 的 `'worktreeRoot' in input` 分支一致）。
- **导航。** 编辑入口 push，Back 返回 Discuss（测试点页头按钮验证）；保存/取消 replace，不在返回栈留下表单页；编辑态「新建项目」replace，避免 create↔edit 堆历史。
- **测试质量。** 隔离测试同时断言：PUT 只发往被编辑项目且 body 只含其四字段；保存后页头更新；另一个项目页头、服务器记录与链路不变；再反向编辑另一个项目只影响它。400 测试断言 toast 文案、仍停留编辑页、输入保留、服务器记录未变。
- **类型与范围。** `tsc --noEmit` exit 0；`pnpm check` 全绿；未改服务端、schema、依赖或数据库；`git diff --check` 干净。

### Spec 轴（按冻结验收标准逐条）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 新建页四字段；POST body 含 name/intakeRepository/codeRepository 与可选 worktreeRoot；400 展示错误并留在本页 | PASS | `projects.tsx:99-170`；`tests/panel-discuss.spec.tsx`「creates a project on its own page…」「omits the worktree root…」「shows the localized refusal…stays on the creation page」；`tests/panel-projects.spec.tsx` 创建用例断言 POST body |
| 2 | Discuss 页头编辑入口；预填；PUT 后刷新返回；另一个项目两条仓库展示不变 | PASS | `discuss.tsx:52-53`、`projects.tsx:117-135`、`app.tsx:153`；测试「edits one project from the Discuss page head…」断言预填四值、PUT path `local/projects/p-widgets` 与 body、保存后页头 `acme/intake → acme/gadgets`、切到 Other 仍 `acme/intake → acme/other`、再编辑 Other 只发 `local/projects/p-other` |
| 3 | 页头与 More 菜单显示两条仓库；空输入/非法仓库/相对根校验文案保持 | PASS | `discuss.tsx:51`、`projects.tsx` 菜单行 `dt-mono`；测试「offers every project from More…」新增两条仓库断言；`userError.projectWorktreeRoot` 路径断言在「keeps the edit page and its values…」；空输入由提交按钮 disabled + `!cleanName/!cleanIntake/!cleanCode` 守卫 |
| 4 | 既有 Tab/More/新建/取消/返回测试仍通过；新增隔离面板测试 | PASS | `panel-projects.spec.tsx` 6/6（3 条既有 + 3 条新增）、`navigation` 7/7、`docs` 14/14；全量 63 files / 1263 tests passed |
| 5 | `pnpm check` 全绿；Before/After 同视口/主题/语言，baseline 为切片开始时 main head | PASS | `docs/issues/evidence/c3-check.log`：exit 0，63 files / 1263 tests，Build complete；`docs/evidence/c3-project-edit/` 8 张 1440×1100、浅色、zh-CN；Before = `afab266e` 真实面板，After = 本分支 head |

## 测试证据

- 定向：`npx vitest run tests/panel-projects.spec.tsx tests/panel-discuss.spec.tsx tests/navigation.spec.ts tests/docs.spec.ts tests/local-align.spec.ts tests/local.spec.ts tests/panel-source.spec.tsx` → `docs/issues/evidence/c3-targeted.log`（7 files / 78 tests passed，exit 0）。
- 全量：`env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check` → `docs/issues/evidence/c3-check.log`（63 files / 1263 tests passed，Build complete，exit 0）。
- 说明：首轮全量在另一个 worktree 并发跑 check 时 `tests/followups.spec.ts` 以 5000 ms 超时失败一次；单独复跑 16/16 通过，随后独占重跑全量全绿（`benchmarks/project-repo-chains/c3-project-edit/evidence/followups-rerun.log`）。
- `git diff --check`：干净。

## 视觉证据（UI 变更）

同一场景（项目 `Widgets` 与 `Other`、两条链路 `acme/intake → acme/widgets` / `acme/intake → acme/other`、`Widgets` 的根目录 `/srv/worktrees`）、同一视口 1440×1100、浅色、zh-CN；Before = `afab266e` 真实面板，After = 本分支 head 真实面板（同一 fake GitHub CLI 与同一 SQLite 形状种子）：

| 场景 | Before | After |
| --- | --- | --- |
| Discuss 页头（Widgets） | `docs/evidence/c3-project-edit/before-discuss-head.png`（`acme/widgets`，无编辑入口） | `docs/evidence/c3-project-edit/after-discuss-head.png`（`acme/intake → acme/widgets` + 「编辑项目」） |
| 新建项目页 | `docs/evidence/c3-project-edit/before-new-project.png`（名称 + 执行仓库 + 根目录） | `docs/evidence/c3-project-edit/after-new-project.png`（名称 + 接收 Issue 仓库 + 执行代码仓库 + 根目录 + 链路提示） |
| 编辑表单 | 基线无此页面（无编辑入口） | `docs/evidence/c3-project-edit/after-edit-form.png`（预填 `Widgets / acme/intake / acme/widgets / /srv/worktrees`） |
| 保存后 Discuss 页头 | — | `docs/evidence/c3-project-edit/after-saved-head.png`（`acme/intake → acme/gadgets`，仍当前项目） |
| 另一个项目 | `docs/evidence/c3-project-edit/before-other.png`（`acme/other`） | `docs/evidence/c3-project-edit/after-other.png`（仍 `acme/intake → acme/other`，未受编辑影响） |

## 架构影响

- 本仓库无 `docs/architecture` / `arch_impact.py`；按 `docs/007-architecture.md` 人工复核：只改 `src/client` 的路由/页面与文案，没有新增模块或依赖，没有服务端、schema、迁移或运行时变化。
- `Architecture impact: local`（面板路由新增一个页面状态，用户可见行为变化；模块职责不变）。

## 尝试记录

- 实现：worker 在本 ticket 分支直接实现（分支由 `afab266e` 合并 C2 分支 `df875f01` 后继续）；首轮 `openTab` 类型报错改为显式字面量路由；编辑入口从 replace 改 push。
- 独立评审 lane：`lane-T1-1`（subagent `689def40-…`）在宿主重启时被中断，未给出结论；`lane-T1-2`（subagent `21e17151-…`）重新做静态双轴评审。
- 视觉证据：两个隔离 profile（`c3edit-before` / `c3edit-after`，端口 3103/3104）各起真实 DSH web；fake `gh` + 种子 SQLite 避免真实 GitHub 凭据；截图后清理。
