# 测试环境前置 · C5

## 单元 / 面板测试

- Node 22 + pnpm 11；`node_modules` 由同 lockfile 的兄弟 worktree 符号链接（`node_modules/` 已 gitignore，不入库）。
- `tests/panel-discuss.spec.tsx` 用 jsdom（文件首行 `// @vitest-environment jsdom`），无真机、无浏览器依赖。
- 面板用例依赖 `tests/fixtures/panel-server.ts` 的类型化假服务；C4 已加入两条提问路由的机械桩，C5 不再改动它。

## 全量检查

```sh
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
```

- 未清 `GIT_CONFIG_GLOBAL`（本机代理会话注入 `/root/.dsh/state/superagent/worker-gitconfig`）时，`tests/runtime.spec.ts` 的 “without mutating the host environment” 两个用例失败。
- 未设 `LC_ALL=C` 时，`tests/environment.spec.ts` 的 git 配置用例因本机中文 git 输出失败。
- 两者都与本切片无关，干净环境下全绿（65 files / 1357 tests，exit 0）。

## 视觉证据

- 两个临时 profile：`~/.dsh/profiles/c5-before`（链接基线树 `/tmp/c5-before2`，端口 3191，stateDir `/root/.dsh/state/c5-before`）与 `~/.dsh/profiles/c5-after`（链接本 worktree，端口 3192，stateDir `/root/.dsh/state/c5-after`）；两者除链接树、端口与 stateDir 外完全相同。
- 同一 seed：`evidence/c5-questions-seed.mjs`（1 个项目、1 条带三切片对齐的需求、3 张已启动会话的关联工单、1 条 answered + 1 条 failed 提问）。
- 同一浏览器：Playwright + `/usr/bin/chromium`，视口 1440×900，`locale=zh-CN`，`color_scheme=light`，滚动位置按 section 顶部对齐。
- Before 由本分支代码树反向应用 C5 提交得到（`git archive <head> | tar -x -C /tmp/c5-before2` + `patch -p1 -R`），因为 deployment `main` 在开工后前进到 `72b4c4a8`；两份都 `pnpm build` 后由各自的 profile 加载 `lib/`。

## 已知限制

- seeded 的 `asked` 记录会在宿主启动时被 `LocalQuestions.resume()` 重新处理，因 demo state 没有真实 worker 会话而落 `failed`，所以截图只呈现 `answered` 与 `failed`；等待态由面板用例覆盖。
- 临时 host 的 token URL 只存在于当次会话，日志里不落 token。
