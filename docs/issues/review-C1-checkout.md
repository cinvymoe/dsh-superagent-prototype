# C1 双轴评审与测试证据 · 运行检出的只读状态 `GET deployment/checkout`

- Run: `run-mwdqup5g-12`（execute，policy A1），issue `q-3603edff:C1`
- Ticket: `2b9bf67f6fd82b0720ed7644ef721c67`
- 分支：`agent/get-deployment-checkout-2b9bf67f6fd8`，起点 deployment `main` @ `40191e32`
- Lane: `lane-T1-1`（subagent spawn，T1）；产出后由主会话复核并做两处小修（见「复核修复」）
- 评审日期：2026-11-13

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/app/checkout.ts`（新） | `CHECKOUT_REASONS`/`CheckoutReason`、`CHECKOUT_GIT` 只读白名单、`repositoryOf`、`readCheckout`、`checkoutReasons`、`restartRequired`、`runGit` 与 `Checkout` 类（构造即发起启动快照） |
| `src/app/http.ts` | `HttpHost.checkout: Pick<Checkout,'status'>`；路由 `'GET deployment/checkout'` |
| `src/app/api.ts` | `Api` 增加该路由的响应类型（`import type { CheckoutView }`） |
| `src/app/runtime.ts` | `readonly checkout: Checkout`；构造 `new Checkout(packageRoot())`；`httpHost()` 传入 |
| `tests/checkout.spec.ts`（新） | 19 个用例：remote 形式、各原因码、`restartRequired` 三态、只读断言、管理路由 |
| `tests/fixtures/panel-server.ts` | `ROUTES` 对 `Api` 穷尽，补一条静态 checkout 应答（typecheck 必需，无面板页面轮询） |
| `docs/007-architecture.md` | Modules 与 Tests 表各加一行 |
| `docs/006-deployment.md` | Management API 表加 `GET deployment/checkout` 一行（写明 `repository` 来自 `origin` remote） |
| `docs/issues/evidence/c1-checkout-*.log` | 红、定向、类型、回归、全量证据 |

## Standards 轴

结论：**通过（approve）**。

- **模块边界**：`src/app/checkout.ts` 只依赖 Node 内建与 `src/infra/environment.ts` 的 `GIT_LOCATION`，不碰 Engine/Store/Policy，也没有反向依赖；`http.ts`、`api.ts` 对它的引用全是 `import type`（`api.ts` 只引类型，面板 bundle 不被 Node 依赖污染）。核心 `src/core` 未被触碰。
- **只读约束是结构性的**：`runGit`（`src/app/checkout.ts:88`）在启动子进程前拒绝 `CHECKOUT_GIT` 之外的子命令，读取路径里没有 `fetch`/`pull`/`push`/`ls-remote`/`clone`/`remote`；同时清空 `GIT_LOCATION` 并关掉交互提示，避免宿主环境把 git 指到别的仓库或卡在密码提示。
- **启动快照语义**：`Checkout` 构造即发起一次读取（`src/app/checkout.ts:100-113`），`status()` 先等快照再读磁盘，因此「合入发生在第一次请求之前」仍会报 `restartRequired: true`；快照失败回落 `{ head: null, dirty: false }`，路由永不 500。
- **读不到就不宣称干净**：`status --porcelain` 读失败按 `dirty: true` 处理（`readCheckout`），避免把「无法检查」当成「可安全合入」。
- **错误语义**：本 slice 不新增 `UserError` 错误码；不可用原因是固定枚举 `CheckoutReason`，面板可本地化，不需要新的文案面。
- **测试质量**：全部用 `mkdtempSync` 临时仓库，不依赖本仓库工作树；`git init -b main` 固定默认分支；只读用例记录真实 argv 并比对工作树文件哈希、HEAD、index 状态与 refs 前后一致；断言的是对外行为（HTTP body、`CheckoutView`），不绑内部实现。
- **文档登记**：`tests/docs.spec.ts` 对 `src`/`tests` 逐文件核对表格，新增模块与测试均已登记；`docs/006` 行只描述事实与字段名。
- **差异卫生**：`git diff --check` 无输出；无无关重构、无新依赖、无配置键/schema 变更。

## Spec 轴（逐条对照冻结验收标准）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 临时 git 仓库上，https 与 ssh 两种 remote 形式（大小写不同、带/不带 `.git`）都能匹配出 owner/name；不匹配时 available=false 且给出 noRepository | PASS | `repositoryOf`（`src/app/checkout.ts:36`）覆盖 https 带/不带 `.git`、大写 host/owner、token、scp、`ssh://…:22/`、`git+ssh`、`git://`，结果统一小写；`tests/checkout.spec.ts:72` 断言 12 种形式；`:89` 断言 gitlab/本地路径/缺 name/多余路径段为 `undefined`；真实仓库侧 `:120`（https available）、`:125`（ssh 大小写）、`:129`（无 origin 与 gitlab remote 均 `available:false` + `reasons:['noRepository']`） |
| 2 | 非 git 目录、detached HEAD、非 main 分支、脏树分别返回对应原因码，同时仍返回可读到的路径/分支/HEAD | PASS | 原因码单一来源 `checkoutReasons`（`src/app/checkout.ts:68`），`notGit` 时只报这一条；用例：`:139`（notGit，`path` 为被读目录、`branch/head` 为 null）、`:146`（detached，`head` 仍可读）、`:153`（notMain，`branch: 'feature'`）、`:158`（dirty，`branch/head` 仍可读）；顺序与组合由 `:97` 的纯函数用例固定 |
| 3 | restartRequired：磁盘 HEAD 与进程启动 HEAD 不同，或进程启动时是脏树 ⇒ true；两者一致且启动时干净 ⇒ false | PASS | `restartRequired`（`src/app/checkout.ts:80`）= `start.dirty \|\| start.head !== head`；`:168`（空提交后 HEAD 变化 ⇒ true）、`:175`（启动即脏，清理后仍 true）、`:183`（一致且干净 ⇒ false，非 git 目录 ⇒ false）、`:192`（构造即读，早于首次 `status()`）、`:199`（纯函数四态） |
| 4 | 该路由只执行本地只读 git 命令；测试断言没有 fetch/网络调用，且目标工作树未被修改 | PASS | 白名单 `CHECKOUT_GIT`（`src/app/checkout.ts:13`）+ `runGit` 拒绝其它子命令；`:208` 记录每次 argv，断言首词都在白名单、无 `fetch/pull/push/ls-remote/clone/remote/submodule`，并比对 `rev-parse HEAD`、`status --porcelain`、`for-each-ref` 与工作树每个文件内容哈希前后一致；`:226` 路由用例走真实 `Checkout`，读目录前后无改动 |
| 5 | 新模块与新测试在 007 的模块表、测试表登记；`pnpm check` 通过 | PASS | `docs/007-architecture.md` Modules 表 `src/app/checkout.ts`、Tests 表 `tests/checkout.spec.ts`；`docs/006-deployment.md` Management API 行；全量 `pnpm check` exit 0（64 files / 1313 tests，Build complete） |

## 测试证据

- 红（只加用例、未实现）：`pnpm vitest run tests/checkout.spec.ts` → exit 1，`Cannot find module '../src/app/checkout.ts'`（`c1-checkout-red.log`）。实现初版后另有 5 条断言真实红过（快照竞态、detached 读法、reasons 组合），修好后转绿。
- 绿（定向）：`pnpm vitest run tests/checkout.spec.ts` → 1 file / **19 tests passed**，exit 0（`c1-checkout-targeted.log`）。
- 类型：`pnpm typecheck` → exit 0（`c1-checkout-typecheck.log`）。
- 相关回归：`pnpm vitest run tests/http.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts tests/client.spec.tsx` → 4 files / **24 tests passed**，exit 0（`c1-checkout-regression.log`）。
- 全量（最终代码）：`env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check` → typecheck + **64 files / 1313 tests passed** + Build complete，exit 0（`c1-checkout-check.log`）。
- `git diff --check`：无输出。

## 复核修复（主会话）

1. `docs/006-deployment.md`：`repository` 明确写「the `owner/name` its `origin` remote names」，避免读者以为它等于部署仓库（见「已知限制」）。
2. `tests/checkout.spec.ts:129`：把「无 origin」用例扩展为「无 origin 或 origin 在其它主机」，用真实 `gitlab.com` remote 端到端断言 `available:false` + `noRepository`，让验收 1 的「不匹配时」在 `Checkout` 层也有直接证据（纯函数层已有）。

## 已知限制（交给后续 slice）

- `repository` 只读 `origin` remote。本部署自己的插件检出（`/root/src/dsh-superagent-prototype` → `/data/project/dsh-superagent`）里 `origin` 指向上游 `deepseek-ai/dsh-superagent-prototype`，而 PR 目标是另一个名为 `deployment` 的 remote（`cinvymoe/dsh-superagent-prototype`）。C1 按验收只负责「从 remote 解析 owner/name」，**合入动作（后续 slice）必须再与部署仓库比对**，不能仅凭 `available`。
- 仓库存在但 `HEAD` 不可读（如空仓库）时 `head: null` 且原因码为空；合入 slice 应把「无可合入的 HEAD」判为不可用。

## 架构影响

- `arch_impact: local`。新增一个自足读模块与一条只读管理路由，`Api`/`HttpHost` 都是新增字段，没有既有调用方语义变化、没有数据库 schema 变更、没有跨模块职责重划。文档更新限于 006 的 API 表与 007 的模块/测试表；面板 UI 归后续 slice。

## 派发与执行记录

- `lane-T1-1`（subagent spawn，T1，cwd 为本工单目录）一次成功；其报告中主动说明 `tests/fixtures/panel-server.ts` 是契约清单外但 typecheck 必需的改动，复核接受。
- 复核后重跑全部四条命令，最终代码全绿；证据日志已被本次（最终代码）覆盖。
