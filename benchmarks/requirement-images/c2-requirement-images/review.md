# C2 双轴评审与测试证据 · 需求图片的存储与读取（服务端）

- Run: `run-mwdadn1u-5`（execute，policy A1），issue `q-612052e8:C2`
- Ticket: `7d197b3b2d9b27eb816cac184ca71255`
- 分支：`agent/slice-7d197b3b2d9b`，基线 deployment `main` @ `afab266e`
- 评审日期：2026-11-12

## 变更范围

| 文件 | 变更 |
| --- | --- |
| `src/app/local-images.ts`（新增） | 需求图片的数量/名称/媒体类型/大小/内容签名校验，base64 解码，`<stateDir>/local-images/<issueId>/` 落盘与失败清理，路径与格式嗅探 |
| `src/app/local.ts` | `LocalIssues.create` 接受 `images`，先校验落盘再写需求记录；记录带 `{id,name,mediaType,bytes}`；触发文本追加每张图绝对路径；新增 `image()` 读取字节 |
| `src/app/http.ts` | `POST local/issues` 使用 32 MiB 专用请求体上限并解析 `images`；`GET local/issues/:id/images/:imageId` 原始字节响应（same-origin、404、no-store、nosniff） |
| `src/app/api.ts` | 创建请求体新增可选 `images`，导出 `localImageUrl` |
| `src/app/runtime.ts` | `LocalIssues` 注入 `stateDir` |
| `src/sources/local-format.ts` | 新增 `LocalImage` / `LocalImageInput`，`LocalIssue.images?` |
| `src/limits.ts` | 新增 `REQUIREMENT_IMAGES` 与 `REQUIREMENT_BODY_BYTES` |
| `src/core/errors.ts`、`src/client/locales.ts` | 5 个可本地化错误码与中英文案 |
| `tests/local.spec.ts`、`tests/local-align.spec.ts`、`tests/fixtures/host.ts` | 单元与 HTTP 覆盖；host fixture 增加原始字节请求 helper |
| `docs/007-architecture.md`、`docs/006-deployment.md` | 模块/测试表、持久化文件与 stateDir 内容 |

## Standards 轴

结论：**通过（approve）**。

- **模块边界**：图片的校验与文件存储集中在新的 `src/app/local-images.ts`，`LocalIssues` 只负责把校验结果写进需求记录和触发文本；HTTP 层只负责请求体上限、schema 与原始字节响应，没有把文件系统细节扩散到路由。
- **单一写入者**：`<stateDir>/local-images` 只由 `LocalIssues`（经 `local-images.ts`）写入和读取；HTTP 不直接碰路径。
- **数据形状**：图片元数据随 `LocalIssue` 记录持久化（KV JSON），不新增数据库 schema；旧记录没有 `images` 字段仍合法。
- **错误语义**：所有图片规则都用 `UserError` 固定错误码（`issueImageCount/Name/Type/Size/Data`），管理 API 返回 400 + `code` + `values`，面板按 code 本地化；不是泛化的字符串错误。
- **请求体边界**：只有 `POST local/issues` 调 `body(REQUIREMENT_BODY_BYTES)`；`readBody` 默认值仍是 128 KiB，其它路由不受影响。
- **测试质量**：断言行为（状态码、错误码、文件字节、响应头），不绑定实现细节；新增 `raw` helper 只补齐二进制响应读取，不改变既有 `api` 行为。
- **差异卫生**：`git diff --check` 无输出；无无关重构、无新依赖。

## Spec 轴（逐条对照冻结验收标准）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | `POST local/issues` 接受图片数组（PNG/JPEG/WebP/GIF，每张 ≤5 MiB，最多 4 张），与需求同一次请求创建；任一张不合法则整单拒绝、不创建需求，并返回可本地化的错误 | PASS | `src/app/local-images.ts:prepare/storeRequirementImages` 先全部校验后写盘；`src/app/http.ts` 路由同请求解析；`tests/local.spec.ts`「stores every type…」「refuses a requirement…」；`tests/local-align.spec.ts`「refuses an invalid image upload…」断言 `issueImageType/issueImageCount/issueImageSize` 与 `local.list()`/目录不变 |
| 2 | 图片落盘到 `<stateDir>/local-images/<issueId>/`，需求记录含每张图的 id、原名、媒体类型、字节数；`GET local/issues/:id` 返回这些元数据 | PASS | `requirementImagesDir`/`requirementImagePath`；`LocalIssues.create` 记录 `images`；`tests/local.spec.ts` 断言 4 种扩展名文件存在且字节相等、元数据匹配；`tests/local-align.spec.ts` 断言 GET 详情 `images` 与 POST 响应一致 |
| 3 | `GET local/issues/:id/images/:imageId` 以存储的媒体类型返回原始字节（no-store）；未知 id 404；不符合 same-origin 的请求 403 | PASS | `src/app/http.ts` `imageRequest`/`imageResponse`；`tests/local-align.spec.ts` 断言 200、`content-type: image/png`、`cache-control: no-store`、字节相等、未知 image/issue 404、缺少 `x-orchestrator-request` 403 |
| 4 | 需求触发文本包含每张图片的绝对路径，测试证明这些路径存在且是有效图片 | PASS | `LocalIssues.requirementText` 追加 `Images:` 与绝对路径；`tests/local.spec.ts` 与 `tests/local-align.spec.ts` 从触发文本取路径、断言 `existsSync` 且 `readFileSync(...).equals(PNG/GIF/WEBP/JPEG)` |
| 5 | 只有创建需求的路由允许更大的请求体（容纳图片），其他管理路由保持 128 KB 上限 | PASS | `REQUIREMENT_BODY_BYTES = 32 MiB` 只用于 `POST local/issues`；`tests/local-align.spec.ts`「lets only the create-requirement route carry a body above the management limit」：200 KiB 图片创建成功、评论路由 200 KiB 返回 `Request exceeds 131072 bytes`、创建路由超 32 MiB 返回 `Request exceeds 33554432 bytes` |
| 6 | `pnpm check` 通过，测试覆盖接受、拒绝（类型/大小/数量）、读取与超限请求 | PASS | `pnpm check`（typecheck + 63 files / 1257 tests + build）exit 0；`docs/issues/evidence/c2-*.log` |

## 测试证据

- `pnpm typecheck`：exit 0（`docs/issues/evidence/c2-typecheck.log`）。
- 定向：`pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/http.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts` → 6 files / 47 tests passed（`docs/issues/evidence/c2-targeted.log`）。
- 全量：`env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm test` → 63 files / 1257 tests passed，exit 0（`docs/issues/evidence/c2-full-test.log`）。
- `pnpm build`：Build complete，exit 0（`docs/issues/evidence/c2-build.log`）。
- `git diff --check`：无输出。

## 架构影响

- `arch_impact: local`。新增一个 app 模块（`src/app/local-images.ts`）、一个原始字节 HTTP 路由与 `<stateDir>/local-images` 文件目录；`LocalIssue` 记录新增可选字段；`POST local/issues` 请求体新增可选 `images`。没有公共类型/函数签名破坏（均为可选新增），没有数据库 schema 变更，没有跨模块职责重划。
- `docs/007-architecture.md` 的 Modules/Tests 表和 Persistence 节、`docs/006-deployment.md` 的 `stateDir` 说明已同步更新。

## 尝试记录

- 实现 lane `lane-C2-1`（subagent `2e66b179-2048-43ee-9ec3-1b3522c52292`）在运行时未产出编辑或结束消息即失败；由 worker 按同一 `docs/issues/task-contract-C2.md` 直接完成实现、测试与验证，并记录该运行时限制。
- 全量测试在干净环境一次通过；无基线失败。

## 测试环境前置

不适用（纯应用逻辑与单元/集成测试；无真机、GUI、截图、旋转或物理设备要求；本切片无 UI 变更，故无需 Before/After 截图）。

## 结论

- Standards：通过。
- Spec：6/6 条冻结验收标准均有可复核证据。
- 建议进入 PR 提交；`Architecture impact: local`，PR 由人复核合并，不启用 auto-merge。