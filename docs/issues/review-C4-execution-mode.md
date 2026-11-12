# C4 评审与测试证据 · 面板需求详情执行模式开关

- Run: `run-mwdp0ifm-8`（execute，policy A1），issue `q-2f92c878:C4`
- Ticket: `6981fa17e4b77f71cfab52840fe96953`
- 分支：`agent/slice-6981fa17e4b7`，基线 deployment `main` @ `40191e32`（C1 `a6e2430d` + C2 #20 已合并）；本切片提交 `18a3f8b1`
- 实现 lane：`lane-T1-1`、`lane-T1-2` 两次派发都在启动阶段失败、未产生任何改动；由 worker 在本工单内直接实现（下方“过程说明”记录）
- 评审日期：2026-11-12

## 变更范围

4 个跟踪代码/测试文件（+80 −6），全部在 `src/client` 与面板测试层，无服务端改动：

| 文件 | 变更 |
| --- | --- |
| `src/client/discuss.tsx` | 需求列表行追加执行模式 Tag；需求详情“对齐结果”卡片在 `alignment.status === 'proposed'` 且未派发时渲染 `dt-switch-row`（`Switch` + `InfoTip` 说明），开关调用 C2 的 `POST local/issues/:id/execution` 并复用既有 `act` 包装（保存后 `reload`、失败 `notify` 本地化错误）；已有派发 Ticket 时改为执行模式 Tag + 只读说明，页面不再出现 Switch |
| `src/client/locales.ts` | 5 条双语键：`discuss.executionSwitch` / `executionHint` / `executionNative` / `executionFeatureExec` / `executionLocked` |
| `tests/panel-discuss.spec.tsx` | 3 个新用例：默认关闭 + `POST …/execution {mode:'feature-exec'}` + 刷新后保持；已派发只读 Tag + 无 Switch + 工单链接；列表行 feature-exec/原生 |
| `tests/fixtures/panel-server.ts` | `localThread(issue, dispatched = false)` 在已派发时为本地需求线程挂一张工单（复用 `ticketSummary`）；`GET local/issues/:id` 传入 `server.dispatchedIssues.has(id)`，让“派发后只读”在 jsdom 里可达 |

证据与文档：`docs/issues/6981fa17e4b77f71cfab52840fe96953.md`、`docs/issues/task-contract-6981fa17e4b77f71cfab52840fe96953.md`、本文件、`docs/issues/evidence/c4-execution-mode-*.log`、`docs/evidence/c4-execution-mode/*.png`。

范围外且未改动：`src/app/**`、`src/core/**`、`src/sources/**`、`docs/005-panel.md`（C5）、`docs/003`、`docs/007`、其它测试文件。C2 的 `LocalIssue.execution`、`requirementExecutionMode`、HTTP 路由与 `userError.executionMode/executionLocked` 原样复用，没有重复实现。

## 双轴评审

### Standards 轴

结论：**通过（approve）**，无 must-fix。

- **模块边界**：执行模式的读写接口属于 C2（`src/app`），本切片只在 `src/client` 消费它；客户端不新造持久化路径、不改 `Api` 契约、不复制 `execution` 字段语义——`requirementExecutionMode` 直接来自 `src/sources/local-format.ts`，未选择即原生的缺省只有这一处。
- **单一文案来源**：模式显示名只由 `executionLabel` 生成（`discuss.executionNative` / `discuss.executionFeatureExec`），列表行与详情只读 Tag 共用 `executionTag`；没有把 `'feature-exec'` 字面量散落在视图里（`requirementExecutionMode` 是唯一判定点）。
- **控件复用**：使用 `controls.tsx` 既有的 `Switch`（`role="switch"` + `aria-checked` + `aria-label`）、`InfoTip`、`Tag` 与既有样式类 `dt-switch-row` / `dt-field-head` / `dt-row-meta` / `dt-tag`；未新增 CSS，`tests/styles.spec.ts` 通过。
- **状态一致性**：开关是受控组件，`checked` 永远由服务端返回的 `issue.execution` 决定；保存走既有的 `act` 包装（`busy` 期间忽略重复点击，成功后 `reload` 读回真实值，失败走 `notify(errorText)` 显示 C2 的 `userError.executionLocked/executionMode`），没有乐观翻转，也没有第二份本地状态。
- **只读判定**：`dispatched` 取 `thread.tickets.length > 0`，与详情下方“关联工单”列表同源，所以“有工单即固定”与页面其它事实不矛盾；只读态用 Tag + 一句话说明，符合“One place per concept / Honest state”。
- **可访问性与文案**：`Switch` 有 `aria-label`，`aria-checked` 反映真实模式；中英双语键同时补齐，`tests/locales.spec.ts` 的键集与占位符检查通过。
- **测试质量**：三个用例都断言可观察行为（`role="switch"` 的 `aria-checked`、请求路径/方法/体、列表行 `.dt-row-meta` 文本、`remount` 后的状态、已派发态无开关），不耦合实现细节；fixture 只补“已派发线程有一张工单”这一真实主机行为，`server.misuse` 在 `usePanelServer` 的 afterEach 仍被断言为空。
- **仓库规范**：无新依赖；`git diff --check` 干净；`pnpm check` 全绿（63 files / 1298 tests + build）；`tests/docs.spec.ts`、`tests/class-docs.spec.ts` 未受影响（没有新增模块或测试文件）。

### Spec 轴（逐条对照冻结验收标准）

1. **待确认时显示 Switch，默认关闭即 native；开启调用 `POST local/issues/:id/execution` 持久化，刷新后仍为 feature-exec**：通过。
   - 详情只在 `alignment.status === 'proposed'` 且 `thread.tickets` 为空时渲染开关；`checked` = `requirementExecutionMode(issue) === 'feature-exec'`，未选择时 `false`（native）。开关 `onChange` 发送 `{ mode: next ? 'feature-exec' : 'native' }` 到 `local/issues/:id/execution`，成功后 `reload` 重新拉取详情。
   - 测试 1：初始 `aria-checked="false"`；点击后请求断言 `method: 'POST'`、`body: { mode: 'feature-exec' }`，fixture 记录 `execution: 'feature-exec'`，开关变 `"true"`；`remount()`（等价刷新）后仍为 `"true"`。
   - 真实面板验证：`after-detail-enabled.png`（开启后）、`after-list-persisted.png`（刷新后列表行仍为 feature-exec，服务端已持久化）。
2. **已有派发 Ticket 后开关隐藏/只读并以 Tag 显示当前模式；列表行显示模式，未选择显示 native**：通过。
   - 已派发：不渲染 Switch，渲染 `executionTag`（`feature-exec` → info tone，`native` → neutral）+ `discuss.executionLocked`；测试 2 断言无 `[role="switch"]`、Tag 文本为 `feature-exec`（种子 `execution: 'feature-exec'`）、锁定提示与关联工单标题存在。列表行始终追加 `executionTag`，测试 3 断言第一条为 `feature-exec`、未选择的一条为 `原生` 且不含 `feature-exec`。
   - 真实面板验证：`after-detail-dispatched.png`（只读 Tag + “已派发工单，执行方式固定。” + 关联工单 2）；`after-list.png`（三行分别为原生 / feature-exec / 原生）。
3. **`pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts` 通过**：通过，2 files / 29 tests（panel 23 + locales 6），见 `docs/issues/evidence/c4-execution-mode-targeted.log`。
4. **PR 描述包含同视口、同主题、同场景的 Before/After 截图并标注基线与改动版本**：见下节视觉证据与 PR 描述。

## 过程说明（诚实记录）

- `lane-T1-1`（subagent `bea5c8d5`）与重试 `lane-T1-2`（`50ec3238`）都在启动阶段失败、没有留下任何工作区改动。两次失败后由 worker 直接按 `docs/issues/task-contract-6981fa17e4b77f71cfab52840fe96953.md` 实现并自测；没有第三轮 lane 重试，也没有把失败伪装成 lane 完成。
- 由于没有独立实现 lane，Spec 轴的逐条核对由 worker 用“测试断言 + 真实面板截图”双向交叉完成，而不是依赖 lane 的自述。
- 截图裁剪：两侧截图都从面板内容左边界（x=280）开始裁到 1440px 右边界，只去掉与本次改动无关的 DSH 侧栏会话列表，保留同一 1440×1100 视口、同一浅色主题、同一 zh-CN 场景。

## 验证记录

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts` | 2 files / 29 tests passed（panel 23，含 3 个新用例） | `docs/issues/evidence/c4-execution-mode-targeted.log` |
| `pnpm typecheck` | exit 0 | `docs/issues/evidence/c4-execution-mode-typecheck.log` |
| `env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check` | 63 files / 1298 tests passed + build exit 0 | `docs/issues/evidence/c4-execution-mode-check.log` |
| `git diff --check` | 无输出 | `docs/issues/evidence/c4-execution-mode-diffcheck.log` |

## 视觉证据

- 基线（Before）：`docs/evidence/c4-execution-mode/before-*.png`，commit `bee00110`（deployment `main` 已含 C1 + C2、尚无 C4）构建出的真实面板。
- 改动版本（After）：`docs/evidence/c4-execution-mode/after-*.png`，本分支 head `18a3f8b1` 构建出的真实面板。
- 两侧均为 1440×1100 视口、浅色主题、zh-CN，同一隔离 profile 种子场景（项目 Widgets + 三条需求：待确认 native、待确认 feature-exec、已派发 native；执行器暂停，派发工单保持 queued），通过管理 API 写入，不含真实飞书内容。
- 场景对照：
  - `before-detail-proposed.png` / `after-detail-proposed.png`：待确认需求的对齐卡片，前无执行方式控件、后有默认关闭的开关（`执行阶段使用 feature-exec`）。
  - `before-detail-feature-exec.png` / `after-detail-feature-exec.png`：已选择 feature-exec 的待确认需求，前无控件、后开关为开。
  - `before-detail-dispatched.png` / `after-detail-dispatched.png`：已派发需求，前无控件、后为 `原生` Tag + 只读说明、无开关。
  - `before-list.png` / `after-list.png`：需求列表，前各行为状态/时间/切片数，后追加执行模式 Tag（原生 / feature-exec / 原生）。
  - `after-detail-enabled.png`、`after-list-persisted.png`（after-only）：点击开关保存后，以及整页刷新后服务端读回仍为 feature-exec。
