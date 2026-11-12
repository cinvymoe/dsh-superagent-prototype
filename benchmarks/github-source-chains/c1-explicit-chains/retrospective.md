# Retrospective · C1 删除旧版单链路

## 做对了什么

1. **先分离「读取归一化」与「保存校验」。** `GithubConfigSchema` 保持严格（只含新形状），旧形状只在读取路径经 `normalizeGithubConfig` 转换；`SourceRegistry.validate` 不应用归一化函数，因此面板保存永远写当前形状。这是同时满足「只接受新形状」和「旧配置仍可读」的关键。
2. **回退语义用键的存在性区分。** `chains` 键存在（即使 `[]`）时绝不回退旧字段；只有旧形状（没有 `chains` 键）才生成 `default` 链路。测试直接锁定 `{chains: [], repository}` → `repositoryUnset`。
3. **面板证据用同一份状态做 Before/After。** before/after 服务共享同一 SQLite 数据，After 显示的是旧配置被归一化成的 `default` 链路，比重新输入一遍数据更能证明读取路径。
4. **实现 lane 一次通过。** 契约把 schema、归一化、字段、文档、测试要点逐条写清；lane 完成后 worker 只补了一条直接断言并复跑全量。

## 踩坑与修复

1. **环境敏感的既有失败。** 宿主继承的 `GIT_CONFIG_GLOBAL` 与本地化 git locale 会让 `tests/runtime.spec.ts`（2 条）与 `tests/environment.spec.ts`（locale）失败，基线同样失败。修复：所有验收命令用 `env -u GIT_CONFIG_GLOBAL LC_ALL=C`，并在报告里注明基线复核。
2. **独立 review lane 无输出。** 与之前几次同类 lane 一样，启动后长时间无输出；中断后由 worker 按 Standards/Spec 清单自审并留证，避免阻塞交付。
3. **profile 初次启动缺少 bundle。** 复制 profile 后必须先在 profile 目录 `pnpm install`，否则 `dsh` 会跳过 `dsh-superagent` bundle，面板只剩宿主界面。
4. **`setupChanged` 对比原始存储值。** 旧形状配置第一次从面板保存会因 `chains` 由“缺失”变为显式数组而触发一次重启；这是预期的一次性迁移行为，测试 fixture 使用已解析的 chains 形状以免误报。

## 限制

- 未做数据库 schema 升级/记录重写；旧形状记录只在读取时归一化，直到下一次面板保存。
- 截图场景是合成状态（fake gh、旧形状配置），不是真实工单数据；未暴露任何私有 Feishu 内容。
