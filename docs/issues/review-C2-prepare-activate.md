# C2 双轴评审 · 服务脚本 prepare / activate

- Ticket: `7a346d2ced9ee30ed5862d8953acfe7d`（alignment `q-3603edff` 的 C2 slice）
- 评审对象：`c7cb98c9`（slice 提交）+ `109d4721`（合入 `main` `f29e841b` 后的合并提交）
- 冻结判据：见 `docs/issues/7a346d2ced9ee30ed5862d8953acfe7d.md`「验收标准（冻结版）」
- 结论：**双轴 APPROVE**（Standards 8 项全 PASS，Spec 5 条判据逐条有证据）；无阻断项，两处自审修正已进本提交

## 轴 A · Standards

| # | 判据 | 结果 | 证据 |
| --- | --- | --- | --- |
| S1 | 单一写入者、零新增配置键/schema/API | PASS | 改动只在 `scripts/dsh-superagent`、其测试与两篇文档；`main()` 只新增 `--repository/--if-idle/--only-when-behind` 与两个 action；`activate` 的 `stateDir` 与 `load.running` 全部来自既有 `GET state`（`docs/006-deployment.md` 的 API 表未改） |
| S2 | 拒绝先于任何改动 | PASS | `prepare()` 顺序：remote 匹配 → 分支 → `git status --porcelain` → fetch → `merge-base --is-ancestor` → `merge --ff-only`；失败全部在 fetch 之前或 `--ff-only` 拒绝时抛错，HEAD/工作树不变（测试逐条断言 HEAD） |
| S3 | 复用既有结构与风格 | PASS | 复用 `state()`/`processes()`/`stop()`/`start()`/`status()` 与 `operation.lock`；新增函数保持单行 docstring、`print(...)` 风格与「异常 → main 打印 → 退出 1」约定；退出码语义（0/1/2/3）未改 |
| S4 | 不用 `git pull`，不产生 merge commit | PASS | `git fetch --no-tags <remote> +refs/heads/main:refs/dsh-superagent/main` + `git merge --ff-only`；测试用 `git rev-list --parents -n 1` 断言单父提交 |
| S5 | 备份在停止之后，恢复前清 WAL/SHM | PASS | `activate` 先 `stop(intentional=False)` 再 `backup_database()`；`restore_database()` 先删 `-wal`/`-shm` 再拷贝，避免把失败版本的日志回放到恢复库上 |
| S6 | 测试真实且不空跑 | PASS | 真实临时 git 检出（路径含空格）+ 真实 bare 远端 + 真实 `python3`；只桩 `pnpm`/`ps`/`tmux`/`dsh` 与 management API；每个新用例带显式 timeout，断言具体 stdout/stderr、HEAD、库内容、`service.pid`、pnpm 调用序列；原有 13 个用例未改断言 |
| S7 | 文档与实现一致、链接有效 | PASS | `docs/006` 新增小节 + Upgrade 交叉引用 + 8 条排查行，命令、输出、退出码与实现逐条对照；`docs/007` 测试表行更新；`tests/docs.spec.ts` 14 tests 通过（编号/链接/模块表/测试表校验） |
| S8 | 卫生 | PASS | `git diff --check` 无输出；无密钥、无真实账号出现在输出或文档；`os.umask(0o077)` 未改；备份目录权限沿用 umask |

## 轴 B · Spec（冻结判据逐条）

| # | 冻结判据 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 真实检出 + bare 远端领先：只做 fast-forward、桩 pnpm install/build 执行、无 merge commit、输出含 from/to；再次执行 up-to-date 且不重启/不重复构建 | PASS | `fast-forwards to the remote main, builds, and builds nothing when it is already there`：断言 `prepare: fast-forwarded from <a> to <b> on main`、`$ pnpm install --frozen-lockfile`、`$ pnpm build`、`rev-list --parents` 长度 2、pnpm 调用序列 `install --frozen-lockfile, build` 两次运行不变、第二次输出 `prepare: up to date at <b> on main` |
| 2 | 脏树/分叉/detached/非 main/仓库不匹配 ⇒ 退出 1 且检出与服务均未变；并发第二个 prepare 被拒 | PASS | 三个用例覆盖：dirty/detached/非 main（HEAD 不变、pnpm 未跑）、diverged（HEAD 停在本地提交）、未匹配/缺失/格式错 `--repository`，以及持锁时退出 1 且 HEAD 不变。`prepare` 全程不接触服务，故「服务未变」由「没有 stop/start 调用」直接体现（`tmux.log` 不存在） |
| 3 | activate 从 `GET state` 读 stateDir、停止后备份、启动并健康校验；`--if-idle`/`--respect-stop`/`--only-when-behind` 三个跳过 | PASS | `activates a new commit`：mock API 提供 `setup.machine.stateDir` 与 `load.running`，断言 `dsh-superagent stopped.`、备份目录名与 `orchestrator.sqlite`/`-wal` 内容、`service.pid` 换为新 pid、无 `manually-stopped`；三个跳过各自断言退出 0 + 无备份目录 + 旧 pid 存活；另有「服务不应答 ⇒ 退出 1 且不启动」 |
| 4 | 注入启动失败：恢复 prepare 前提交与备份库、重装重建、旧版本启动成功、打印回滚、退出 1 | PASS | `rolls the checkout, the database and the service back`：第一次 tmux 启动不给 pane pid（新版本无法健康），断言 exit 1、`rolling back to <a>`、`activate: restored the database from`、`rolled back to <a>; the previous version is running again.`、HEAD 回到 `<a>`、库与 `-wal` 内容为旧库、pnpm 调用序列 6 次（两次 install+build）、`ps-started.txt` 出现旧 pid 且 `service.pid` = 旧 pid |
| 5 | 现有 `tests/service-script.spec.ts` 全部通过；`pnpm check` 通过 | PASS | `pnpm vitest run tests/service-script.spec.ts` → 27 tests passed（原 13 + 新 14）；干净 git 环境 `pnpm check` → 64 files / 1329 tests + build 完成（`docs/issues/evidence/c2-prepare-activate-*.log`） |

## 自审发现与处置

| # | 发现 | 处置 |
| --- | --- | --- |
| F-1 | `activate` 只捕获 `RuntimeError`，tmux 失败抛出的 `CalledProcessError`/`OSError` 会跳过回滚，把检出留在「新提交已构建但服务已停」 | 已修正：`activate` 与 `rollback` 统一捕获 `(OSError, RuntimeError, subprocess.CalledProcessError)` |
| F-2 | 缺「服务不应答」的行为用例，而这条拒绝正是「停下来但不知道库在哪」的唯一防线 | 已补用例 `refuses to activate while no service answers` |
| F-3 | `--only-when-behind` 的用例名写成「只要求重启」，与它实际保护的行为相反 | 已重命名 |
| F-4 | `prepare` 在校验分叉前就 force-fetch 了 `refs/dsh-superagent/main`，被拒绝的一次运行也会移动该私有 ref（HEAD/工作树不变） | 接受不改：该 ref 只是 fetch 落点，从不作为「上次成功合入」的记录；已写入回归案例 `retrospective.md` 的残留风险 |

## 未覆盖项（如实声明）

- 真实 `pnpm install --frozen-lockfile` / `pnpm build` 在用例中被桩替换；真实构建由 `pnpm check` 覆盖命令形态，但**没有**端到端验证「真实构建失败 → 回滚」这条路径。
- 本次不改面板、API、配置键与提示词，因此**无 UI 变化**，PR 不需要 Before/After 截图；面板动作与端到端流程分别属 C3、C4。
- 宿主 profile（如 systemd 的 web profile）仍由操作者重启，脚本不重启自己不管理的进程；文档已明确。
