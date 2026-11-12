# task-contract · T1 · C2 本地项目拥有并隔离自己的仓库链路

## 背景

- 对齐 issue：`q-141a6a1e`，slice `C2`；冻结验收标准见 `docs/issues/4e2a92d2a5b4c1485e70aa07b8adfd99.md`。
- 工作区：`/data/project/workspace/dsh-worktrees/slice-4e2a92d2a5b4`，基线 deployment `main` @ `afab266e`（含 C1）。
- 现状：`LocalProject` 只有 `repository`；`Runtime.ticketDeployment` 用项目 repository 覆盖部署仓库；项目与 GitHub Source 的 `chains` 无关联；没有 PUT 项目路由；面板项目表单只有一个执行仓库。
- C1 已让 `chains` 成为 GitHub Source 唯一配置（`GithubConfigSchema` 严格、旧形状读取归一化）。本任务不得改动该 schema，只在其上增删链路行。

## 唯一目标

每个本地项目拥有自己的 GitHub 仓库链路（chain id = 项目 id），创建/修改项目只影响自己的链路，项目工单按该链路执行；旧记录在启动时幂等绑定到 code repository 相同的既有链路。

## 设计（按此实现，不要另立方案）

### 1. 数据模型 `src/sources/local-format.ts`

```ts
export interface LocalProject {
  id: string
  name: string
  /** GitHub chain id owning this project's repositories; absent on a legacy project with only `repository`. */
  chain?: string
  /** Repository whose Issues the project receives; absent only on a legacy record. */
  intakeRepository?: string
  /** Repository workers check out and open pull requests in; absent only on a legacy record. */
  codeRepository?: string
  /** Execution repository of a project created before projects owned chains; read-only fallback. */
  repository?: string
  worktreeRoot?: string
  createdAt: string
  updatedAt: string
}
```

新建项目不写 `repository`，写 `chain`、`intakeRepository`、`codeRepository`。旧记录字段保持可读。

### 2. 项目记录与校验 `src/app/local.ts`

- 保留同步 `createProject(input: LocalProjectInput)`（`{name, repository, worktreeRoot?}`）供既有 in-process 调用/测试创建**旧记录**（无 chain）；它只写项目记录，不碰设置。
- 新增导出的字段类型与纯记录操作，供协调层使用：
  - `export interface LocalProjectFields { name: string; repository?: string; intakeRepository?: string; codeRepository?: string; chain?: string; worktreeRoot?: string }`
  - `validateProject(input: LocalProjectFields, except?: LocalProject): LocalProjectFields`：trim；name 必填（route 已保证，仍按 `projectTaken` 语义检查大小写不敏感重名，`except` 排除自身）；仓库格式 `owner/name`（`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`），优先 `codeRepository`（缺 `intakeRepository` 时回退 code），否则用 `repository`；非法 → `UserError('projectRepository')`；`worktreeRoot` 省略/空白 = 未配置，非空必须是绝对路径，否则 `UserError('projectWorktreeRoot')`。
  - `draftProject(fields, at?): LocalProject`：id 仍为 `p-${key('local-project', at, name).slice(0, 8)}`；有 codeRepository 时写入 `chain: fields.chain ?? id`、两仓库；有 repository 时写 repository；worktreeRoot 仅在非 undefined 时写。
  - `putProject(project)`、`projectNameTaken(name, exceptId?)`、`patchProject(project, fields)`（内部用，更新 name/两仓库/worktreeRoot 并刷新 updatedAt）。
- 旧 `createProject` 行为（含 worktree root 语义与错误码）逐字保持，现有 `tests/local.spec.ts` 不改也能过。
- 新增 `updateProject(id, input)` 不要放在 LocalIssues；由协调层组合。

### 3. 项目链路协调层 `src/app/projects.ts`（新文件）

```ts
export class Projects {
  constructor(host: { store: Store; local: LocalIssues; settings: Settings })
  async create(input: { name: string; intakeRepository: string; codeRepository: string; worktreeRoot?: string }): Promise<LocalProject>
  async update(id: string, input: { name?: string; intakeRepository?: string; codeRepository?: string; worktreeRoot?: string }): Promise<LocalProject>
  bindLegacy(): void
}
```

实现要求：

- `source()` 读取 `settings.block('source:github')`，用 `GithubConfigSchema.parse(normalizeGithubConfig(block.value.config))` 得到当前 config（`GithubConfigSchema.parse` 已有默认值）；返回 `{block, config, enabled}`。GitHub Source 未安装/无块时：`create`/`update` 抛 `UserError('sourceNotInstalled', { source: 'github' })`（项目链路由 GitHub Source 承载）。
- 写链路统一走 `settings.save('source:github', { enabled, config: { ...config, chains } }, block.revision, 'panel')`。**不要**新增写 settings 的旁路；不可读/不可推送由 `Settings.save` 的 `setup.checkAccounts`（`resolveDeployment`）在写入前抛 `SetupError`，HTTP 自动映射 400。
- `create`：
  1. `local.validateProject(input)`；
  2. 生成项目草稿（chain id = 项目 id）；
  3. **先写项目记录** `local.putProject(project)`，再保存链路；保存失败时 `store.delete(KV.local.project(project.id))` 删除记录后重新抛出，保证失败无产物、成功时项目记录与链路同时存在。
  4. 追加链路只允许 `chains: [...现有行, 新行]`，已有行原对象不动。
- `update`：
  1. `local.project(id)` 不存在 → `UserError('unknownProject')`（HTTP 404）。
  2. 合并未提供字段（name 取原值；仓库取原 `intakeRepository/codeRepository`，旧记录回退 `repository`；`worktreeRoot` 用 `'worktreeRoot' in input` 区分“省略=保持”与“空=清除”）。
  3. `local.validateProject(merged, project)`。
  4. 目标 chain id = `project.chain ?? project.id`；`chains.map(row => row.id === target ? { ...row, intakeRepository, codeRepository } : row)`；若目标行不存在则追加；**其他行必须原引用/深度相等**。
  5. 保存链路；再写项目记录；写记录失败时尽力回滚到保存前的 config。
  6. 旧项目（无 chain、只有 repository）只改 name/worktreeRoot 时不创建链路，保持旧记录执行语义；一旦给出仓库字段或已有 chain，则拥有/更新自己的链路。
- `bindLegacy()`：读当前 config 的 chains；对每个 `!project.chain && !project.codeRepository && project.repository` 的项目，找 `chain.codeRepository === project.repository` 的第一条（唯一）链路；命中则写回 `chain: chain.id`、`intakeRepository: chain.intakeRepository`、`codeRepository: chain.codeRepository`（保留 `repository`），`updatedAt` 更新；未命中保持原样。整个方法只写项目记录、不改 settings；重复调用结果不变（已绑定项目跳过）。
- 记录写入用 `store.set(KV.local.project(id), …)`；删除用 `store.delete(KV.local.project(id))`。时间用 `new Date().toISOString()`（LocalIssues 内部有 clock；协调层可直接取）。

### 4. 运行时 `src/app/runtime.ts`

- 字段 `readonly projects: Projects`，在 `this.local` 之后构造：`new Projects({ store, local: this.local, settings: this.settings })`。
- `initialize()` 在 `registerHttp` 之后、`setup.run` 之前调用 `this.projects.bindLegacy()`（幂等；只依赖已存 settings）。
- `ticketDeployment(ticket)` 改为：
  ```ts
  const base = this.setup.deploymentFor(ticket.execution?.chain)
  const project = this.ticketProject(ticket)
  if (!project) return base
  if (project.chain) {
    const resolved = this.setup.deploymentFor(project.chain)
    if (resolved.chain === project.chain) return resolved
    // 运行期新建/修改、尚未重启解析的链路：按已存配置构造，账号信息取 base。
    const stored = githubChains(GithubConfigSchema.parse(normalizeGithubConfig(this.store.settings().sources.github?.config ?? {})))
      .find(chain => chain.id === project.chain)
    if (stored) return { ...base, chain: stored.id, repository: stored.codeRepository, intakeRepository: stored.intakeRepository }
  }
  const code = project.codeRepository ?? project.repository ?? base.repository
  const intake = project.intakeRepository ?? code
  return { ...base, repository: code, intakeRepository: intake }
  ```
  项目工单由此得到 `execution.chain = project.chain`，`ticketExecution`（`src/executor/dsh.ts`，不改）写入 chain/repository/intakeRepository；`ticketEnvironment` 也走本方法，两个 GitHub 仓库变量随之正确。
- `httpHost()` 暴露 `projects: Projects`（`HttpHost` 增加 `readonly projects: Projects`）。

### 5. HTTP `src/app/http.ts` + `src/app/api.ts`

- `POST local/projects`：body schema `{ name: z.string().trim().min(1).max(80), intakeRepository: z.string().trim().min(3).max(200), codeRepository: z.string().trim().min(3).max(200), worktreeRoot: z.string().trim().max(4096).optional() }`，`return { project: await runtime.projects.create(input) }`。
- 新增 `PUT local/projects/:id`：body 全部可选 `{ name?, intakeRepository?, codeRepository?, worktreeRoot? }`，至少一个字段（否则 `RouteError(400, 'No project field to update')`）；`{ project: await runtime.projects.update(params.id, input) }`。`UserError('unknownProject')` 已由 failure() 映射 404。
- `api.ts`：更新 POST body 类型；新增 `'PUT local/projects/:id': { body: { name?: string; intakeRepository?: string; codeRepository?: string; worktreeRoot?: string }; response: { project: LocalProject } }`。

### 6. 面板 `src/client/projects.tsx`、`src/client/discuss.tsx`、`src/client/locales.ts`

- 新建项目页：两个仓库输入框（接收 Issue 的仓库、执行代码的仓库）+ worktree root；两者都非空才能提交；payload `{ name, intakeRepository, codeRepository, ...(root ? { worktreeRoot: root } : {}) }`。
- 项目栏 More 菜单的副标题、Discuss 页头、需求详情项目行显示两条仓库（`intakeRepository → codeRepository`，旧记录只有一个 repository 时显示它），worktreeRoot 保持现有展示。
- locales（zh/en 成对）：
  - `discuss.projectIntakeRepository`: 接收 Issue 的仓库（owner/name）
  - `discuss.projectCodeRepository`: 执行代码的仓库（owner/name）
  - `discuss.projectRepositories`: 仓库链路（接收 Issue → 执行代码）
  - 删除/替换仅在不再使用时删除 `discuss.projectRepository`；`userError.projectRepository` 文案保持可用。
- 保持现有 `.dt-*` DOM 结构与 aria 语义；jsdom 测试按新字段更新。

### 7. 测试（不得削弱既有覆盖）

- `tests/fixtures/host.ts`：`subprocess.spawn` 的 `answers` 增加仓库探测应答，至少 `acme/intake`（readable）、`acme/readonly`（`push:false`）、`acme/project`（push:true）；保留 `acme/widgets`。不要改动其他 fixture 行为。
- `tests/local-align.spec.ts` 新增 `describe('project repository chains')`：
  1. POST 两仓库项目：200；项目视图含 `intakeRepository` 与 `codeRepository`；`settings.sources.github.config.chains` 只新增一条 `id === project.id` 的链路，创建前快照的每条已有链路 `toEqual` 原值；`chains.length` +1。
  2. 非法仓库格式（`not-a-repository`）→ 400 `code: 'projectRepository'`；重名 → 400 `code: 'projectTaken'`；不可读仓库（`acme/missing`）→ 400；`acme/readonly` 作为 codeRepository → 400（不可推送）。以上每种都断言 `GET local/projects` 无该项目、settings chains 与创建前深度相等（无失败产物）。
  3. PUT：创建 A、B 两个项目（各自一条链路），记录 B 的行；PUT A 改 name 与 codeRepository → 200；A 的链路行更新为新仓库；B 的行 `toEqual` PUT 前快照；GET 项目 A 的 name/两仓库为新值。
  4. 项目工单：创建项目（intake `acme/intake`、code `acme/widgets`）→ 提交 issue → accept；断言 `ticket.execution.chain === project.id`、`execution.repository === 'acme/widgets'`、`execution.intakeRepository === 'acme/intake'`，`ticketEnvironment` 的 `DSH_SUPERAGENT_GITHUB_REPOSITORY`/`DSH_SUPERAGENT_GITHUB_INTAKE_REPOSITORY` 等于该链路两仓库。
  5. 启动绑定：用 `startRuntime(seed)` 预置两个旧项目（一个 `repository: 'acme/widgets'` 与默认链路 code 相同，一个 `repository: 'acme/legacy'` 无匹配）与一条自定义链路（`acme/legacy` 不匹配）；启动后：匹配项目 `chain === 'default'`、两仓库等于该链路；再次调用 `runtime.projects.bindLegacy()` 记录不变（幂等）；未匹配项目 `chain` 仍缺失；其工单执行 `repository === 'acme/legacy'`（旧回退），且 settings chains 未被修改。
- 更新受影响的既有断言（POST body 从 `repository` 改为两仓库；项目视图字段；面板文案）。
- `tests/panel-projects.spec.tsx`、`tests/panel-discuss.spec.tsx`：创建项目提交 `{name, intakeRepository, codeRepository}`；页头/详情显示 `acme/intake → acme/widgets`；保留 worktree root 断言。`tests/fixtures/panel-server.ts` 的 POST 项目分支与 `localProjects` 类型改为新字段（并保持 worktreeRoot 400 行为）。
- 进行 `pnpm check` 全量验证。

### 8. 文档

`docs/005-panel.md`、`docs/007-architecture.md` 由本次执行的 worker 负责更新（lane 不改这两份）：项目拥有自己的仓库链路、创建/修改只影响自己的链路、旧记录启动绑定与回退。

## 不可做

- 不改 `src/deployment.ts` 的 `GithubConfigSchema`/`GithubChainSchema`/`normalizeGithubConfig` 语义（C1 已验收）。
- 不改 Shell/账号初始化探测流程；不新增依赖；不做数据库 schema 迁移。
- 不改 `docs/005-panel.md`、`docs/007-architecture.md`、`docs/issues/` 下的计划/评审文件（worker 负责）。
- 不 commit、不 push、不建 PR。
- 若发现冻结标准自相矛盾或必须跨出本 slice 范围，停止并在报告中说明，不自行扩张。

## 验证命令

```
pnpm typecheck
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/panel-projects.spec.tsx tests/panel-discuss.spec.tsx tests/deployment.spec.ts tests/panel-source.spec.tsx
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

## 回报格式

1. 改动文件清单与关键 diff 摘要。
2. 六条冻结验收标准各自对应的实现位置与测试名。
3. 上述命令实际结果（通过/失败数；失败是否为基线既有项）。
4. 未完成项、偏离设计之处与限制。
