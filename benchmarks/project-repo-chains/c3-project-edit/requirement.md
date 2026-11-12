# Requirement snapshot and frozen acceptance

## 需求原文（来源 trigger `ca586e78ff99c152e30518b3533b6bb9`）

> 1我当前项目superagent 修改 接收Issue的仓库 执行代码的仓库 ，rust_crane 也跟着修改了。 没有隔离。我的想法是 每个项目独立。
> 2旧版单链路 删除
>
> 仓库链路(一个 Issue 仓库 → 一个执行仓库)
> 接收Issue的仓库(旧版单链路) 2
> cinvymoe/dsh-superagent-prototype
> 执行代码的仓库(旧版单链路)
> cinvymoe/dsh-superagent-prototype

C1 删除旧版单链路；C2 让每个本地项目拥有并隔离自己的仓库链路。C3 补全面板的使用路径：同一个独立表单既创建也编辑当前项目，编辑或创建只提交当前项目，另一个项目的两条仓库展示与链路保持不变。

## 冻结验收标准（来自 C3 assignment）

1. 新建项目页按上述四个字段渲染；提交 body 含 `name`、`intakeRepository`、`codeRepository` 与可选 `worktreeRoot`；服务端 400 时展示对应错误并留在当前页，不跳转。
2. Discuss 页头或项目栏提供编辑入口；编辑表单预填当前项目值，保存 `PUT local/projects/:id` 后刷新并返回，另一个项目的两条仓库展示不变。
3. Discuss 页头与项目菜单显示接收 Issue 的仓库和执行代码的仓库；空输入、非法仓库、相对 `worktreeRoot` 的既有校验文案保持。
4. 项目 Tab 切换、溢出 More 菜单、独立新建页与取消/返回语义的既有测试仍通过；新增「编辑一个项目不影响另一个项目」的面板测试。
5. `pnpm check` 全绿；PR 附同一视口、同一主题、同一语言的 Before/After 截图，baseline 为本切片开始时的 main head，after 为本分支 head。
