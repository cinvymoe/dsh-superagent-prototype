# C3 评审与测试证据 · 面板提交需求支持图片

- Run: `run-mwdbfee8-6`（execute，policy A1），issue `q-612052e8:C3`
- Ticket: `fd4370f4967a89692063df8d02daa80c`
- 分支：`agent/slice-fd4370f4967a`，栈基线 `fe2bb2e9`（deployment `main` @ `afab266e` 合入未合并的 C1 `#12` 与 C2 `#14`）
- 实现 lane：`lane-C3-1-1`（subagent `7fb1ec26-acd2-4355-8c30-50c1b10a3ab4`，T2 / high，完成并报告全部验证通过）
- 评审日期：2026-11-12

## 变更范围

8 个跟踪文件（+312 −19，全部在面板/测试/文档层，无服务端改动）：

| 文件 | 变更 |
| --- | --- |
| `src/client/discuss.tsx` | 新建需求表单的图片选择（隐藏多选 input + 可见按钮）、缩略图/文件名/移除、数量与限制提示、描述+图片同请求提交、失败保留输入；详情按顺序的画廊（对象 URL + 卸载回收）、列表行图片数量；带图片时原始 Trigger 的去重匹配 |
| `src/client/api.ts` | `requirementImage(issueId, imageId)`：带 `x-orchestrator-request: '1'` 读取图片字节，返回 `Blob` |
| `src/client/client.css` | `dt-image-*` 与 `dt-requirement-image` 的选择器、缩略图卡片与画廊样式 |
| `src/client/locales.ts` | 选择、限制提示、移除、数量与三条客户端拒绝文案（中英占位符一致） |
| `src/client/controls.tsx` | `ICON_PATHS` 增加 `image` 图标 |
| `tests/fixtures/panel-server.ts` | create 路由回填图片元数据、新增图片字节读取路由（返回原始字节而非 JSON）、`refuseIssueCreate` 拒绝开关；`localThread` 按 C2 合同在原始 Trigger 文本后追加图片路径 |
| `tests/panel-discuss.spec.tsx` | 6 个新用例：选择/提交/详情顺序、提交前移除、类型与大小本地拒绝、服务端拒绝保留输入、列表图片计数、同源头读取 + 对象 URL |
| `docs/005-panel.md` | 两个需求页签行更新，新增 `### Requirement images` 小节（四条限制与同源读取规则） |

范围外且未改动：`src/app/**`、`src/sources/**`、`tests/local*.spec.ts`、`tests/http.spec.ts`、`docs/007-architecture.md`。

## 双轴评审

### Standards 轴

结论：**通过（approve）**，无 must-fix。

- **模块边界**：服务端图片存储/路由沿用 C2，本切片只在 `src/client` 增加选择、提交与展示；图片 URL 复用 `src/app/api.ts` 的 `localImageUrl()`，没有第二处路径拼接。
- **鉴权路径**：图片字节只能经 `fetch(localImageUrl(...), { headers: { 'x-orchestrator-request': '1' } })` 读取（`src/client/api.ts:112-118`），`<img>` 的 `src` 只会是 `URL.createObjectURL(blob)`；没有把带图片 id 的 URL 直接塞进 `<img src>` 而绕过 same-origin 头。卸载时 `revokeObjectURL`，异步返回时组件已卸载则直接丢弃（`src/client/discuss.tsx:26-43`）。
- **状态保持**：`submit` 只在 `await call('POST local/issues')` 成功后清空描述与图片；`catch` 只 `notify(errorText(failure))`，已有 `errorText` 按 `userError.*` 本地化（`src/client/discuss.tsx:97-111`）。
- **限制来源单一**：数量、大小与媒体类型直接 import `REQUIREMENT_IMAGES`（`src/limits.ts` 无 import，可被面板 bundle 安全引用），没有复制魔法数字；`accept` 属性与运行期检查同源。
- **可访问性**：文件输入有 `aria-label`，每个移除按钮的 `aria-label` 含文件名，缩略图 `alt` 为原始文件名，图片加载中/失败显示占位 `span` 而非破图。
- **样式规范**：新增规则一行一条、每个选择器在块内只出现一次；`tests/styles.spec.ts` 通过。
- **测试质量**：断言可观察行为（DOM 卡片/名称、请求体、`fetch` 调用头、object URL 与 `<img src>`），不耦合实现；新增 `refuseIssueCreate` 开关与图片字节路由让服务端拒绝与展示路径真实可测；`server.misuse` 在 afterEach 仍会被断言为空。
- **仓库规范**：无新依赖；`git diff --check` 干净；`pnpm check` 全绿；`tests/docs.spec.ts` 的模块/测试表完整性通过（未新增模块或测试文件）。

### Spec 轴（逐条对照冻结验收标准）

1. **表单选择控件、多选、缩略图/文件名、移除、限制提示**：通过。
   - `<input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif">` 带 `aria-label=discuss.imagesChoose`；每个已选图片渲染 `img.dt-image-thumb`（`alt`=文件名）、`span.dt-image-name`（`title` 显示全名）与移除按钮；`p.dt-hint` 写明 PNG/JPEG/WebP/GIF、≤5 MiB、最多 4 张；测试 1–2 覆盖选择与移除。
2. **同一次创建请求、详情按序、列表数量**：通过。
   - 请求体只在有图片时附带 `images: [{ name, mediaType, data }]`，与 `body`、`project` 同一次 `POST local/issues`；详情按 `issue.images` 顺序映射为 `figure.dt-image-card`，图注为 `文件名 · 格式化字节数`；列表行仅在 `issue.images?.length` 时追加 `discuss.imageCount`；测试 1、2、5 覆盖。
3. **客户端拒绝 / 服务端拒绝保留输入**：通过。
   - 选择时依次检查类型、大小、数量，命中即 `notify` 本地化文案并整批不添加（不发请求）；提交路径在成功前不清空任何状态，服务端拒绝时描述值与两张缩略图仍在且页面不跳转；测试 3、4 覆盖。
4. **同源管理 API 读取、无免鉴权 URL、详情正常显示**：通过。
   - 每张图独立 `fetch` 且带 `x-orchestrator-request: '1'`；`URL.createObjectURL` 后赋给 `<img>`，卸载时撤销；测试 6 直接检查 `vi.mocked(fetch).mock.calls` 的 URL/头与渲染出的 `src`。
5. **`pnpm check` + 面板测试覆盖 + Before/After 截图**：通过。
   - `pnpm check` exit 0（63 files / 1274 tests + build）；面板测试 20 个用例，覆盖选择/移除/提交/展示/两种拒绝；截图见下节。

### 附带修正（同一 acceptance 的可见副作用）

带图片的需求，C2 会把 `\n\nImages:\n- <绝对路径>` 追加到 Thread 首个 Trigger 的文本。C1 的去重只比较 `trigger.text === body`，因此有图片时完整描述会在「消息记录」里再出现一次。本切片把匹配扩展为「正文相等，或（有图片时）以 `<正文>\n\nImages:` 开头」，仍只跳过第一条原始消息，普通评论不受影响；`tests/panel-discuss.spec.tsx` 的首个用例断言完整描述只出现一次且 `.dt-timeline` 不含描述。

## 验证记录

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `docs/issues/evidence/c3-images-typecheck.log` |
| `pnpm vitest run tests/panel-discuss.spec.tsx tests/local.spec.ts tests/local-align.spec.ts tests/http.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts tests/controls.spec.tsx` | 8 files / 76 tests passed | `docs/issues/evidence/c3-images-targeted.log` |
| `env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm check` | 63 files / 1274 tests passed + build exit 0 | `docs/issues/evidence/c3-images-check.log` |
| `git diff --check` | 无输出 | 本分支工作树 |

## 视觉证据

- Before：`docs/evidence/c3-requirement-images/before-*.png`，栈基线 `fe2bb2e9`（C1+C2 已合入、尚无 C3）构建出的真实面板，1440×1100、浅色、zh-CN。
- After：`docs/evidence/c3-requirement-images/after-*.png`，本分支 head 构建出的真实面板，同场景、同视口、同主题、同语言。
- 对照：新建需求页（Before 无图片控件 → After 已选两张图片，显示缩略图与文件名）、需求列表（Before 无图片数量 → After「2 张图片」）、需求详情（Before 只显示正文与含图片路径的消息 → After 正文下按顺序展示两张图片、图注为文件名与字节数，消息记录不再重复描述）。
- 截图数据通过管理 API 写入隔离 state（项目 Widgets、两条需求、两张图片）；线上 `superagent-test` 部署未使用，截图不含真实工单或私有飞书内容。

## 限制与风险

- **堆叠依赖**：本分支包含未合并的 C1（PR #12）与 C2（PR #14）。它们的 PR 若先合并，本 PR 相对于 `main` 的差异会自动收缩为纯 C3 增量；若先评审本 PR，请只重点看 C3 的 8 个文件差异。
- **Before 基线**：取自栈基线而非 deployment `main`。这是"同一场景"的要求所致：main 上还没有 C1 的新建需求页与 C2 的图片服务端，无法呈现"有图片但面板未支持"的对照；C3 的 Before/After 因此以栈基线标注。
- **测试环境**：jsdom 没有 `URL.createObjectURL`/`revokeObjectURL`，测试在模块级 stub 并 `mockClear`；详情读取断言的是调用头与渲染结果，不加载真实图片解码。
- **范围**：不做拖拽上传、图片编辑/裁剪/排序、评论附图，也不回填旧需求的图片。
