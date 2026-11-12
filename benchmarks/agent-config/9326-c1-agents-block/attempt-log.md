# 试错台账

| # | 动作与假设 | 预期 | 实际失败信号 | 失败原因 | 有效修正 |
| --- | --- | --- | --- | --- | --- |
| 1 | 派单 lane（subagent）实现全切片 | lane 完成并回 report | subagent 被停止（宿主重启），无收尾消息；仅 4 个文件 + 新模块落盘 | 执行环境重启，非实现错误 | `git status`/`git diff` 读部分产物后自行补完 views/history/http/tools/locales/tests/docs |
| 2 | `pnpm check` 全量门禁（继承宿主 env） | 全绿 | 3 例失败：`tests/environment.spec.ts` 期望 `/bad config/` 得到中文 git 错误；`tests/runtime.spec.ts` 断言 `GIT_CONFIG_GLOBAL` 未设置 | worker shell 注入 `GIT_CONFIG_GLOBAL` 与 `LANG=zh_CN` | 用 `env -u GIT_ASKPASS -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_NOSYSTEM -u GIT_PAGER -u GIT_TERMINAL_PROMPT -u LANGUAGE LANG=C.UTF-8 LC_ALL=C.UTF-8` 重跑，全绿；单独复跑那 2 个文件 108 例通过 |
| 3 | `git commit -m` 写含反引号的中文正文 | 提交信息原样 | 反引号内单词被 shell 当命令执行，正文被吞词 | 双引号内命令替换 | `git commit --amend -F - <<'MSG'` 重写 |
| 4 | `git fetch origin main` 后 merge | 合并部署 main | “拒绝合并无关的历史” | 宿主 worktree 的 `origin` 指向另一仓库 | `git fetch https://x-access-token:$TOKEN@github.com/cinvymoe/dsh-superagent-prototype.git main:refs/remotes/target/main` 后 merge |
| 5 | 合并 `main @ 422a21a4` | 自动合并 | `src/app/sessions.ts` 冲突：main 新增问答 Session 的 `ANSWER_TOOLS`，本片删掉了旧常量 | 同一文件同一区域的双向改动 | 保留 `ANSWER_TOOLS`，删除重复旧常量，其余从 `agent-tools.ts` import |
| 6 | 合并后重跑全量门禁 | 全绿 | 无（66 files / 1352 tests，build 成功） | — | 无需修正 |
