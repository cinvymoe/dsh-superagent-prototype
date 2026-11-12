# 模式沉淀：C3 文档 slice

## 成功模式：文档贴着实现写

- 场景：文档类 slice（003/005/006/007 + docs.spec）。
- 做法：先读实现事实（解析函数、校验函数、面板字段、locale 文案），列成“事实清单”；再按事实改文档；最后为每条冻结验收标准写 `prose()` 断言。
- 收益：文档、实现、断言三处对齐；评审可按验收标准逐条给证据。
- 复用：任何“更新文档 + 文档测试”的 slice。

## 成功模式：基线复跑归因测试失败

- 场景：全量测试出现与 diff 无关的失败。
- 做法：`git stash` 本次改动 → 在干净基线运行同测试文件 → 记录结果 → `git stash pop`；两次日志都留证。
- 收益：避免把环境噪声当成回归，也让 PR 的风险说明可核。
- 复用：任何 CI/本地测试失败归因。

## 坑模式：集成分支已有同 slice 交付时先对账

- 场景：ticket 基线落后/分叉于部署 fork main，同一 slice 已合并。
- 做法：`git log <integration-base> --oneline` 与 PR 历史先查重；若已有同 slice，merge 集成分支，解决冲突时保留两边真实差异（本例保留 amended main 的 execute-flow 句子），并在 PR 描述写清净变更。
- 教训：重复 slice 的“冲突”通常不是实现冲突，而是基线分叉；先对账再动手，避免把已交付内容重写一遍。

## 坑模式：部署仓库 403 时走 operator fork

- 场景：`DSH_SUPERAGENT_GITHUB_REPOSITORY` 拒绝 App push。
- 做法：push 到可写的 operator fork（`cinvymoe/dsh-superagent-prototype`），在 fork 上开 PR（base `main`），在 PR 与 issue 中记录限制；不要反复尝试上游 PR 或本地合并冒充交付。
- 复用：所有部署仓库只读、但存在 operator fork 的环境。

## 坑模式：板式文档改动的断言要跨行

- 场景：`tests/docs.spec.ts` 对长段落做 `toContain`。
- 做法：加 `prose(path)` 先 `replace(/\s+/g, ' ')` 归一，再断言完整句子；改文档时同步改断言，避免换行导致假失败。
- 复用：任何对 Markdown 段落做内容断言的测试。