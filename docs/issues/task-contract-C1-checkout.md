# Task contract · C1 `GET deployment/checkout`

- Ticket: `2b9bf67f6fd82b0720ed7644ef721c67`（slice `C1`，alignment issue `q-3603edff`）
- Worktree / cwd: `/data/project/workspace/dsh-worktrees/get-deployment-checkout-2b9bf67f6fd8`
- Slice issue（需求原文、冻结验收、避坑清单）：`docs/issues/2b9bf67f6fd82b0720ed7644ef721c67.md`
- Branch: `agent/get-deployment-checkout-2b9bf67f6fd8`（已存在，HEAD = 部署仓库 `main` @ `40191e32`）

## Goal

给管理 API 增加只读路由 `GET deployment/checkout`：读出「运行中的 dsh-superagent 加载的本地检出」的仓库名、路径、分支、HEAD、脏树状态与 `restartRequired`。只执行本地只读 git 命令，不落库、不改工作树、不访问网络。

## 实现（按此契约，不要另起设计）

### 1. 新模块 `src/app/checkout.ts`

```ts
/** Read-only status of the checkout dsh-superagent runs from, from local git commands alone. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GIT_LOCATION } from '../infra/environment.ts'

const exec = promisify(execFile)

/** Why a checkout cannot receive a local merge, in the order a status reports them. */
export const CHECKOUT_REASONS = ['notGit', 'noRepository', 'detached', 'notMain', 'dirty'] as const
export type CheckoutReason = typeof CHECKOUT_REASONS[number]

/** The git subcommands a checkout read runs: all local and read-only, and none reaching a remote. */
export const CHECKOUT_GIT: readonly string[] = ['rev-parse', 'symbolic-ref', 'config', 'status']

/** Runs one local git command in a directory and answers its standard output; a failed command rejects. */
export type Git = (args: string[], cwd: string) => Promise<string>

/** The facts a checkout read found on disk, before any judgement. */
export interface CheckoutReading { root: string | null; repository: string | null; branch: string | null; head: string | null; dirty: boolean }
/** The checkout as this instance found it at startup, which a restart compares the disk against. */
export interface CheckoutStart { head: string | null; dirty: boolean }
/** The status the management API answers. */
export interface CheckoutView { path: string; repository: string | null; branch: string | null; head: string | null; dirty: boolean;
  available: boolean; reasons: CheckoutReason[]; restartRequired: boolean }

/** `owner/name` a GitHub remote names, lowercase, for the https and ssh forms git accepts; undefined for any other remote. */
export function repositoryOf(remote: string): string | undefined
/** Reads a directory's checkout facts with local git commands only. */
export async function readCheckout(git: Git, directory: string): Promise<CheckoutReading>
/** Why a reading cannot receive a local merge, in CHECKOUT_REASONS order. */
export function checkoutReasons(reading: CheckoutReading): CheckoutReason[]
/** Whether the code on disk changed, or the tree was already dirty, since this instance started. */
export function restartRequired(start: CheckoutStart, head: string | null): boolean

/** The checkout the running plugin was loaded from: what it was when this instance started, and what it is now. */
export class Checkout {
  constructor(directory: string, git: Git = runGit)
  status(): Promise<CheckoutView>
}
```

语义（逐条）：

- `repositoryOf`：接受 `https://github.com[/...]/owner/name[.git]`、`https://<user>[:token]@github.com/owner/name[.git]`、`ssh://[git@]github.com[:22]/owner/name[.git]`、`git+ssh://`、`git://`、scp 形式 `[git@]github.com:owner/name[.git]`；scheme 与 host 大小写不敏感；`owner`/`name` 只允许 `[A-Za-z0-9_.-]`，结果统一小写。非 github.com 主机（gitlab、本地路径、`file://`）→ `undefined`。
- `readCheckout`：
  1. `git rev-parse --show-toplevel`（cwd=directory）；失败/空 → `{ root: null, repository: null, branch: null, head: null, dirty: false }`。
  2. root 得到后并行跑：`symbolic-ref --quiet --short HEAD`（失败=detached，branch 记 `null`）、`rev-parse HEAD`、`config --get remote.origin.url`、`status --porcelain`。
  3. `dirty`：`status --porcelain` 输出非空；**读失败也记 dirty=true**（读不到就绝不宣称干净）。
  4. 每个命令单独 try/catch 成 `undefined`，`readCheckout` 本身不抛。
- `checkoutReasons`：`root === null` → 只回 `['notGit']`；否则依次 `repository === null → noRepository`、`branch === null → detached`、`branch !== 'main' → notMain`、`dirty → dirty`。
- `restartRequired(start, head)`：`start.dirty || start.head !== head`（两条 head 都是 `string | null`，相等即一致）。
- `Checkout`：构造时**立刻**发起启动快照 `readCheckout`（只留 `head`/`dirty`，失败回落 `{ head: null, dirty: false }`），`status()` 先 `await` 快照，再读磁盘，组合出 `CheckoutView`：`path = reading.root ?? directory`、`available = reasons.length === 0`。
- 默认执行器 `runGit`：子命令不在 `CHECKOUT_GIT` 里直接抛错；`execFile('git', args, { cwd, timeout: 10_000, maxBuffer: 1MB, env: { ...process.env, 清空 GIT_LOCATION, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' } })`。

### 2. 挂载

- `src/app/http.ts`：`HttpHost` 加 `readonly checkout: Pick<Checkout, 'status'>`（`import type { Checkout, CheckoutView } from './checkout.ts'`）；路由表加 `'GET deployment/checkout': () => runtime.checkout.status()`。
- `src/app/api.ts`：`import type { CheckoutView } from './checkout.ts'`，`Api` 加 `'GET deployment/checkout': { response: CheckoutView }`（只引类型）。
- `src/app/runtime.ts`：`readonly checkout: Checkout`；构造里 `this.checkout = new Checkout(packageRoot())`（`packageRoot` 来自 `../infra/paths.ts`）；`httpHost()` 传 `checkout: this.checkout`。

### 3. 新测试 `tests/checkout.spec.ts`

全部用 `mkdtempSync(join(tmpdir(), 'dsh-superagent-checkout-'))` 建临时仓库，`afterEach` 删；子进程一律用 `tests/fixtures/git.ts` 的 `gitEnv()`，提交显式给 `GIT_AUTHOR_*/GIT_COMMITTER_*`（`gitEnv` 会清掉这些变量）。`git init -q -b main`。

必须覆盖：

1. `repositoryOf`：https 带/不带 `.git`、大写 `GITHUB.COM`/`Acme/Widgets`、scp `git@github.com:Acme/Widgets.git`、`ssh://git@github.com:22/acme/widgets.git`、尾斜杠；`https://gitlab.com/acme/widgets.git`、`/srv/widgets.git`、`https://github.com/acme`（缺 name）、多余路径段 → `undefined`。
2. 真实仓库：main + https remote → `available true`、`reasons []`、`repository 'acme/widgets'`；scp ssh remote 大小写不同 → 同样 `'acme/widgets'`。
3. 无 remote → `['noRepository']`，同时 `branch 'main'`、`head` 非空、`path` 是仓库根。
4. 非 git 目录 → `['notGit']`，`path` 是被读的目录、`branch/head` 为 `null`。
5. `git checkout --detach` → `['detached']`，`head` 仍可读、`branch null`。
6. `git checkout -b feature` → `['notMain']`，`branch 'feature'`。
7. 改一个已跟踪文件 → `['dirty']`，`branch/head` 仍可读、`available false`。
8. `restartRequired`：干净 main 快照后再 `git commit --allow-empty` ⇒ `true`；启动即脏（先写文件再 `new Checkout`）⇒ 清掉改动后仍 `true`；干净一致 ⇒ `false`；非 git 目录 ⇒ `false`。
9. 只读断言：注入记录型 git 执行器（记录 argv 后转调真实 git），`await status()` 之后断言每条 argv 首词都在 `CHECKOUT_GIT` 内、整个 argv 里没有 `fetch|pull|push|ls-remote|clone|remote|submodule`；前后对比 `rev-parse HEAD`、`status --porcelain`、`for-each-ref` 与工作树文件内容哈希（排除 `.git`），全部一致。
10. 路由：用 `registerHttp` + 最小 `HttpHost`（`ready: Promise.resolve()`、`checkout`）挂载，`GET deployment/checkout` 回 200 且 body 等于 `CheckoutView`（含 `reasons`）；再换一个非 git 目录实例，断言 `reasons: ['notGit']`。

### 4. 文档登记

- `docs/007-architecture.md`
  - `## Modules` 表加一行 `src/app/checkout.ts`，说明：`repositoryOf` 解析 https/ssh remote 为 `owner/name`、`readCheckout` 只跑本地只读 git 命令、`checkoutReasons` 给出不能本地合入的原因码、`restartRequired` 对比磁盘与实例启动、`Checkout` 为包根回答这些事实。
  - `## Tests` 表加一行 `tests/checkout.spec.ts`，说明覆盖两种 remote 形式、每个原因码、`restartRequired`、只读命令与工作树不变、管理路由。
- `docs/006-deployment.md` 的 `### Management API` 表加一行 `GET deployment/checkout`，说明返回 `path`、`repository`、`branch`、`head`、`dirty`、`available`、`reasons`（`notGit`/`noRepository`/`detached`/`notMain`/`dirty`）与 `restartRequired`。

## 约束

- 不新增配置键、不落库、不改 SQLite/schema、不加面板 UI 或文案、不加 Prompt 文本。
- 模块首行 JSDoc，`Checkout` 类前有 JSDoc；导出函数带 JSDoc（仓库风格）。
- 不引入新依赖；`Api` 只允许 `import type`。
- 不改 `tests/http.spec.ts`、`tests/fixtures/host.ts`（本 slice 不需要）。
- 只改上面列出的文件；`docs/issues/**` 由主会话维护，不要动。

## 验证（全部执行，日志落 `docs/issues/evidence/`）

```sh
pnpm vitest run tests/checkout.spec.ts 2>&1 | tee docs/issues/evidence/c1-checkout-targeted.log
pnpm typecheck 2>&1 | tee docs/issues/evidence/c1-checkout-typecheck.log
pnpm vitest run tests/http.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts tests/client.spec.tsx 2>&1 | tee docs/issues/evidence/c1-checkout-regression.log
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check 2>&1 | tee docs/issues/evidence/c1-checkout-check.log
```

红/绿：先只加 `tests/checkout.spec.ts` 跑一次记录红灯（`c1-checkout-red.log`），再实现到全绿。

## Report format

收尾报告写明：改了哪些文件、四条命令的真实结果（通过/失败）、`git status --porcelain` 输出、遇到的坑与处理、任何未满足的验收项。不要 commit、不要 push、不要开 PR。
