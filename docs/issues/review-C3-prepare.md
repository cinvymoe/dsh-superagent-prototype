# C3 双轴评审与测试证据 · 部署页持有运行检出与「拉取并构建」

- Run: `run-mwdtjrbq-1`（execute，policy A1），issue `q-3603edff:C3`
- Ticket: `4b2e5405034cd590e0de80c3f261847a`
- 分支：`agent/slice-4b2e5405034c`，起点 deployment `main` @ `422a21a4`，已 merge C1 分支 `agent/get-deployment-checkout-2b9bf67f6fd8`（合并提交 `d2a6ede1`；C1 PR #28 未合前本 PR 的 diff 含 C1 提交）
- 评审日期：2026-11-12

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/app/checkout.ts` | 只读事实扩展：`committedAt`（`git log -1 --format=%cI`，`log` 进只读白名单）、`remotes`（`git config --get-regexp '^remote\..*\.url$'` 经 `checkoutRemotes()`/`repositoryOf` 解析、按名字排序）；`CHECKOUT_REASONS`/`checkoutReasons`/`restartRequired` 语义不变 |
| `src/app/prepare.ts`（新） | `Prepare`：链匹配（全部 remote × 各链 code repository）、`noChain`/`empty` 原因、单飞 `merge()`（spawn 服务脚本的 `prepare` 动作、日志目录与 0600 文件、最近 10 份、4000 字符尾部、`prepareFailed`/`prepareBusy`/`prepareUnavailable`），不写检出、不发信号、不重启 |
| `src/app/api.ts`、`src/app/http.ts` | `GET deployment/prepare` / `POST deployment/prepare` 类型与路由；`HttpHost.prepare` 只暴露 `status`/`merge` |
| `src/app/runtime.ts` | `readonly prepare`，复用同一个 `Checkout` 实例，`packagePath('scripts','dsh-superagent')` 与 `<stateDir>/prepare`；链来自 `setup.configured()` 的 `deployment.chains` |
| `src/core/errors.ts`、`src/client/locales.ts` | 三个 `UserError` 码与两语言文案；`deploymentCheckout*` 18 键 + `checkoutReason.*` 7 键 |
| `src/client/deployment.tsx` | 部署页「运行中的检出」区块：路径/分支/7 位短 HEAD+时间/工作树/匹配链仓库；不可用原因与禁用、setup 未完成等待；确认后 POST、成功刷新并显示「重启后生效」、失败保留页面展示脚本文本与日志路径；`usePoll` + `useAction`/本地 busy 防重复 |
| `tests/prepare.spec.ts`（新，14 例） | 非 origin remote 的链匹配、noChain、empty、notMain/dirty 顺序、status 不改工作树/refs/HEAD、成功参数与日志权限、up-to-date、脚本拒绝与 spawn 失败、真脚本 shebang 端到端（fast-forward + 两次 pnpm）、真脚本退出码/参数、单飞、失败后可重试、不 kill/exit、不可用不跑脚本 |
| `tests/checkout.spec.ts` | 完整断言同步新字段；新增多 remote/提交时间用例 |
| `tests/http.spec.ts` | GET 形状、POST 200 与 400 三态（code+values）、`process.kill`/`process.exit` 未被调用且 POST 后 `GET state` 仍 200 |
| `tests/panel-deployment.spec.tsx` | 5 例：事实与短 HEAD/时间/脏状态、不可用原因+禁用、setup 等待、确认后只 POST 一次+新 HEAD+重启标签、失败保留页面+脚本文本+日志路径 |
| `tests/fixtures/panel-server.ts` | `server.prepare`/`prepareFailure` 与两条路由；`GET deployment/checkout` 补新字段；`misuse` 仍为空 |
| `docs/006-deployment.md`、`docs/007-architecture.md` | 两条路由与 `committedAt`/`remotes` 的契约；模块表与测试表登记 |
| `docs/issues/evidence/c3-prepare-*.log`、`docs/evidence/c3-deployment-checkout/*.png` | 类型、定向、回归、全量、before/after 截图与日志 |

## Standards 轴

结论：**通过（approve）**。

- **模块边界**：`checkout.ts` 只回答「这份检出是什么」（只读事实）；`prepare.ts` 回答「能不能合入、合入哪个链、怎么合入」；HTTP 只做参数与错误映射；面板只消费契约。合入动作经 `Prepare.merge()` 唯一入口，Runtime 把 C1 的同一个 `Checkout` 注入 `Prepare`，两条路由共享同一份启动快照，没有第二个事实来源。
- **单一写入者**：路由与 `Prepare` 只 `spawn` `scripts/dsh-superagent prepare`，不自己执行 git/pnpm、不写检出；`environment()` 清掉 `GIT_LOCATION` 并禁交互提示，保留用户 git 配置以维持 fetch 认证。
- **无副作用约束**：不调用 `process.kill`/`process.exit`/restart，不写 Settings，不碰 Ticket；`tests/prepare.spec.ts` 与 `tests/http.spec.ts` 都有 spy 断言，POST 之后管理 API 继续应答。
- **单飞与并发**：单飞标记在第一个 `await` 前占位；第二个请求得到 400 `prepareBusy`；脚本自带的 `operation.lock` 仍是跨进程的第二道闸。失败路径在 `finally` 清标记，失败后可以再次尝试（有测试）。
- **错误语义**：三个 `UserError` 码 → 400 + `code`/`values`；面板按 `values.message`/`values.log` 持久展示，不把长脚本文本塞进 toast；不可用与成功也各有本地化文案。
- **日志**：写 `<stateDir>/prepare/`（目录 0700、文件 0600、保留 10 份），不写进检出——`prepare` 合入前会做脏树检查，检出里多一个未忽略文件就会被它拒绝。
- **测试质量**：真实临时 git 仓库；断言精确 argv（`prepare --repository …`）、日志权限、尾部长度与日志完整性；真脚本端到端（本地 bare 镜像 + pnpm 桩）把「服务脚本的 CLI 动作/参数」钉在测试里；面板用例断言 `server.misuse` 为空、POST 只发一次。
- **文档与卫生**：`docs.spec`/`class-docs.spec`/`locales.spec`/`styles.spec` 全过；`git diff --check` 无输出；无新依赖、无无关重构。

评审中发现并修正的一处真实缺陷：实现初版按接口描述把服务脚本参数写成 `['--repository', …]`，缺少 CLI 要求的 `prepare` 动作，真实运行时报 `argparse` 错误（before/after 截图第一次捕获即暴露）。已改为 `['prepare', '--repository', …]`，并新增「真脚本 shebang 端到端」用例，把动作名与参数顺序钉死；定向与全量复跑通过。

## Spec 轴（逐条对照冻结验收标准）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 页面显示路径、分支、短 HEAD+时间、脏状态、匹配链仓库；不可用时按钮禁用并显示原因；setup 未完成时显示等待 | PASS | `deployment.tsx` 的 `LocalCheckoutSection`/`LocalCheckout`；`after-deployment.png` 显示 `/tmp/c3-after-src`、`main`、`cc0a5d3 6分钟前`、干净、`cinvymoe/dsh-superagent-prototype`；`after-dirty.png` 显示「有未提交改动」「无法拉取并构建：工作树有未提交的改动」与禁用按钮；`tests/panel-deployment.spec.tsx` 三条用例覆盖事实、原因+禁用、setup 等待 |
| 2 | 确认后 POST 成功 ⇒ 刷新为新 HEAD 并显示「重启后生效」；失败 ⇒ 保留页面并展示脚本拒绝/失败信息与日志路径；重复点击只执行一次 | PASS | `after-merged.png`：HEAD `cc0a5d3 → 9a462c3` 与「重启后生效」；`after-failed.png`：`prepare: this checkout has commits origin/main does not have; …` 与日志路径，页面事实仍在；面板用例断言双击只 1 次 POST；`http.spec` 的 busy 用例；`prepare.spec` 单飞用例 |
| 3 | 该路由不发送任何重启/退出信号（测试断言），不可用或并发时返回 400，且服务继续运行 | PASS | `tests/http.spec.ts`「sends no restart or exit signal … keeps answering after it」（`process.kill`/`process.exit` 未调用、POST 后 `GET state` 200）；`tests/prepare.spec.ts` 同类断言；不可用/并发/失败分别 400 `prepareUnavailable`/`prepareBusy`/`prepareFailed`（http + prepare 用例） |
| 4 | 中英文案齐全；`tests/panel-deployment.spec.tsx` 与 `tests/http.spec.ts` 覆盖；`pnpm check` 通过 | PASS | `locales.ts` 新增键成对、占位符一致（`locales.spec` 6 tests）；`docs.spec`/`class-docs.spec`/`styles.spec`/`client.spec` 30 tests；全量 `pnpm check` 67 files / 1382 tests + typecheck + build，exit 0（`c3-prepare-check.log`）；定向 4 files / 49 tests、prepare 14 tests |
| 5 | PR 附 before/after 实际运行截图，标注基线与改动提交，不暴露密钥或私人内容 | PASS | before：`422a21a4`（deployment main）克隆 + 隔离 profile 的部署页（无检出区块）；after：本分支 `cc0a5d33` 的四张图（就绪/脏/合入成功/失败）；同视口 1440×1100、浅色、zh-CN、同路由；隔离 profile + 种子库 + 本地镜像，不触真实 GitHub/Feishu；token 未入图或日志 |

## 测试证据

- 定向：`pnpm vitest run tests/prepare.spec.ts tests/checkout.spec.ts` → 2 files / 33 tests passed（`c3-prepare-targeted.log`）。
- HTTP：`pnpm vitest run tests/http.spec.ts` → 1 file / 6 tests passed。
- 面板：`pnpm vitest run tests/panel-deployment.spec.tsx` → 1 file / 12 tests passed。
- 类型：`pnpm typecheck` → exit 0（`c3-prepare-typecheck.log`）。
- 相关回归：`pnpm vitest run tests/docs.spec.ts tests/class-docs.spec.ts tests/locales.spec.ts tests/client.spec.tsx tests/styles.spec.ts` → 5 files / 30 tests passed。
- 全量：`env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm check` → 67 files / 1382 tests passed + Build complete，exit 0（`c3-prepare-check.log`）。
- `git diff --check`：无输出。

## 架构影响

- `arch_impact: local`。在既有部署链路（`Checkout` 只读事实 → 管理路由 → 服务脚本）上扩展两个只读字段、新增一个模块与两条路由；`CheckoutView` 只增字段（C1 契约向后兼容），`prepareUnavailable`/`prepareBusy`/`prepareFailed` 为新错误码，`Api` 条目为新增。无 schema/迁移、无配置键、无数据库或公共类型破坏、无跨模块职责重划。
- 运行时新增 `<stateDir>/prepare/` 运行日志目录（与 `.artifacts`、`worker-bin` 同级的运行产物，不进检出）；`docs/006`/`007` 已登记。文档流程（本地合入并生效的操作说明）归 C4。

## 已知限制

- 合入请求在一个 HTTP 请求里同步等待脚本结束（长构建期间该请求占用；事件循环不被阻塞）。面板在自己的 `busy` 与轮询的 `running` 上显示进行中，脚本的 `operation.lock` 仍是跨进程闸门。
- 宿主在脚本运行中途退出的情形未专门处理：子进程不随宿主显式终止，下一次合入会被 `operation.lock` 拒绝并在日志里留下原因；需要人工确认后再试。
- 捕获环境使用种子状态库与 setup 桩 CLI、并让 `origin` 指向本地 bare 镜像（`insteadOf`）以在离线环境走通真实脚本；面板、脚本与路由都是真实代码，仅 Git 远端是本地镜像。环境说明见 `c3-prepare-capture-after.log`。

## 派发与执行记录

- Lane `lane-T1-1`（subagent/spawn，T1，medium，cwd 即本工单目录）完成实现与自测，未 commit/push；worker 自审时把 `Prepare` 改为复用 Runtime 的同一个 `Checkout`、补 poll 失败展示、调整脏状态文案，并在真实捕获中定位/修正缺 `prepare` 动作的缺陷、补真脚本端到端用例。
- 真机捕获两轮：首轮暴露缺动作缺陷；修正后重建 after 检出与镜像，四张 after 截图与 before 基线完成。
