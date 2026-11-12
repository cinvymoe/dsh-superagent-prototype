# 复盘

## 本轮做对了什么

- 先落冻结验收标准与任务契约（`requirement.md`/`task-contract.md`），实现与评审都按同一份判据走，没有返工范围。
- 读取/保存分层一次到位：升级容忍（存量未知工具名）与保存校验（必需/未知工具）用不同层实现，测试各锚一处。
- HTTP 面用 `tests/fixtures/host.ts` 的 `api()` 走真实路由，目录/拒绝/history 全覆盖，避免只测 service 层。

## 踩过的坑（详见 patterns.md 与 attempt-log.md）

1. 实现 lane 中途被停止（宿主重启），只落了 4 个文件 + 新模块；续跑时先读 diff 再补完，未重复劳动。
2. 全量门禁被宿主 `GIT_CONFIG_GLOBAL`/`LANG=zh_CN` 干扰（3 个无关用例失败）；clean env 下 1352 例全绿。
3. 提交信息里的反引号被 shell 展开，提交信息被吞词；`commit --amend -F -` 修正。
4. 宿主 worktree 的 `origin` 是另一个仓库，fetch/merge 部署 main 需用 `gh auth token` 的 URL。
5. 合并部署 main 后 `src/app/sessions.ts` 冲突（main 新增 `ANSWER_TOOLS`）。

## 下次从哪一步开始能一次做对

- 进 worktree 先确认 `git remote -v` 与部署仓库是否一致；不一致就直接 token URL fetch `refs/remotes/target/main`。
- 跑全量门前固定用 `environment.md` 的 clean-env 包装命令。
- 提交信息一律 `-F -` heredoc，不用 `-m` 传含反引号的正文。
- 涉及“把常量搬出模块”的切片，预期与 main 同区冲突，先看 `git log main -- <file>` 有无新增常量再动手。
