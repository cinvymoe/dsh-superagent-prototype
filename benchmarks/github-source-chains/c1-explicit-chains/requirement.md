# Requirement snapshot · C1

- Alignment issue: `q-141a6a1e`
- Slice: C1
- Source trigger: `ca586e78ff99c152e30518b3533b6bb9`（`local:q-141a6a1e`）
- Batch trigger: `ea21f31f4177d613717f07b27e92c9af`（「pr 合并后 本地也需要生效」）

## 需求原文

> 1我当前项目superagent 修改 接收Issue的仓库 执行代码的仓库 ，rust_crane 也跟着修改了。没有隔离。我的想法是 每个项目独立。
> 2旧版单链路 删除
>
> 仓库链路(一个 Issue 仓库 → 一个执行仓库)
> 接收Issue的仓库(旧版单链路)
> cinvymoe/dsh-superagent-prototype
> 执行代码的仓库(旧版单链路)
> cinvymoe/dsh-superagent-prototype

本 slice 只承接第 2 点（删除旧版单链路）；「每个项目独立/仓库隔离」由同一计划的其他 slice 承接。

## 冻结验收标准

- `GithubConfigSchema` 只接受 `{cli, chains: [{id, intakeRepository, codeRepository}], ...}`；`chains` 为空时 setup 返回 `repositoryUnset`，不再回退到 `repository`。
- 旧形状 `{repository, intakeRepository, codeRepository}` 的已存配置可被读取归一化为 `id=default` 的链路；从面板保存一次后，存储配置只含 `chains`，不再含旧字段。
- Source 设置卡不再出现「旧版单链路」和「旧版仓库（兼容）」字段；链路行可新增/编辑，缺少 `id` 或 `codeRepository` 的链路被拒绝。
- 相关定向测试更新并通过；`pnpm check` 全绿。
- `docs/003` 与 `docs/006` 不再描述旧版单链路回退，并写明显式 `chains` 为必需配置。

## 范围

范围内：`src/deployment.ts`、`src/sources/{github,kind,registry}.ts`、`src/app/setup.ts`、相关 tests、`docs/003`、`docs/006`、面板 Before/After 证据。

范围外：项目/仓库隔离（其他 slice）、数据库 schema 升级或记录重写（只读取归一化 + 保存落 `chains`）、其他 Source。
