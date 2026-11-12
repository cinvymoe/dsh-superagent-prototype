# 测试环境前置

- 本案例为纯文档/文档测试，不涉及真机、GUI、截图或设备方向。
- 运行环境：Node `v22.23.1`、pnpm `11.7.0`；仓库依赖通过 `pnpm install --offline --frozen-lockfile` 安装。
- 截图旋转：不适用。
- 证据路径：ticket 工作区 `docs/issues/evidence/`（`docs-spec.log`、`typecheck.log`、`build.log`、`full-test.log`、`failing-baseline-stash.log`）。
- 已知环境噪声（非本案例缺陷）：
  - 本机 git 输出中文错误文本，`tests/environment.spec.ts` 的英文 `bad config` 断言失败；
  - 宿主已设置 `GIT_CONFIG_GLOBAL=/root/.dsh/state/superagent-test/worker-gitconfig`，`tests/runtime.spec.ts` 的两个“不污染宿主环境”断言失败。
  - 两项均在未改动基线 `5556291` 上复现（`git stash` 后运行同两个文件，3 failed / 102 passed）。