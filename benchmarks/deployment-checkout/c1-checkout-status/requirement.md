# Requirement snapshot (frozen)

- Alignment issue: `q-3603edff`, slice `C1`, confirmed by the owner in the Discuss panel; this ticket was dispatched from it.
- Source trigger: `d68e64d08be395602be0f947d1bf88de` (`local:q-3603edff`).

## The owner's words

> 当前的Issue都是以 PR 形式在远程仓库提交。最后执行，提交完成后。比如说我的插件是在本地运行的我需要本地的代码能够生效。所以说是否要在设置里面增加一个本地仓库的选项？或者讨论一下有没有什么更好的实现方式？能否在提示词或者流程里面新增加一个本地合入并生效的流程。跟我讨论如何 方式实现。尽量满足高内聚低耦合。

## The plan behind the slice

A local merge and its effect split into three steps: **read the running checkout (this slice C1)** → merge into it (later slice) → restart so the merged code runs (later slice). The target is the checkout the running dsh-superagent was loaded from: the plugin is installed with `dsh plugin --profile superagent add "link:$PWD"` and upgraded inside that same checkout with `git pull && pnpm install && pnpm build` (`docs/006-deployment.md`), so `packageRoot()` names it and no new configuration key is needed.

## Frozen acceptance criteria

1. On temporary git repositories, both the https and the ssh remote forms (different case, with and without `.git`) match `owner/name`; when nothing matches, `available=false` with `noRepository`.
2. A non-git directory, a detached HEAD, a branch other than main and a dirty tree each answer their own reason code, while the readable path, branch and HEAD are still returned.
3. `restartRequired`: the disk HEAD differs from the HEAD the process started on, or the tree was already dirty when it started ⇒ true; both agree and the start was clean ⇒ false.
4. The route runs local read-only git commands only; the tests assert no fetch or network call and that the target work tree is unmodified.
5. The new module and the new test are listed in the module and test tables of 007, and `pnpm check` passes.

## Interface contract the later slices consume

`GET deployment/checkout` answers `path` (the repository root, or the directory read when it belongs to no repository), `repository` (the lowercase `owner/name` its `origin` remote names, or `null`), `branch` (`null` on a detached HEAD), `head` (`null` when unreadable), `dirty`, `available`, `reasons` (`notGit`, `noRepository`, `detached`, `notMain`, `dirty` — `notGit` alone when the directory is no checkout) and `restartRequired`. It needs no completed setup.

Known limits handed to the merge slice: `repository` reads the `origin` remote, and this deployment's own plugin checkout has `origin` on the upstream `deepseek-ai/dsh-superagent-prototype` while the pull request target lives in a remote named `deployment`; a merge must compare with the deployment repository rather than trust `available`. An empty repository reports `head: null` with no reason code.
