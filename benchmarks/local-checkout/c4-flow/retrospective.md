# Retrospective

- **A documentation slice still needs a fact check against the code.** The assignment's prompt used `Intentional stop is active; activation is skipped.`; the script prints `…activation skipped.` (`scripts/dsh-superagent:426`) and `tests/service-script.spec.ts:423` already pinned that. Documentation was written from the code, not from the assignment text. Next time: grep each quoted output line in `scripts/` and `tests/` before writing it.
- **Pinned sentences are executable specifications.** The first draft joined the key sentence to a preceding clause with a colon and lowercase `a`, which the `toContain` assertion rejected. Pinning full standalone sentences keeps a drift visible without pinning paragraph layout. Next time: write the sentence in the doc and the assertion in the same edit.
- **Host-profile restart needs a concrete example but no invented command.** `systemctl restart dsh-web` is the real supervisor of this deployment's host (`/etc/systemd/system/dsh-web.service`, `ExecStart=/root/.bun/bin/dsh web --port 8399`); the doc labels it as an example and tells other operators to use their own supervisor. Next time: verify the unit and its `ExecStart` before naming it.
- **Numbered-document links are one-way.** The panel document cannot link the later deployment document; the cross-reference lives in 006 → 005 (already) and 007 → 006 (new). `tests/docs.spec.ts` enforces it, so a "helpful" forward link would fail the suite.
- **Merge the base before reporting ready.** `main` moved from `72b4c4a8` to `aa326483` (PR #39) while the slice ran; merging it kept the PR `MERGEABLE` and required one re-run of `tests/docs.spec.ts` and the full suite (67 files / 1400 tests).
- Scope held: no attempt to restart or activate anything, no prompt change, no code change. The plan's `lane: light` still produced a small benchmark case because the regression value is the pinned documentation assertions.

## Test environment three questions

1. 真机 / GUI / 截图？无。本切片纯文档与文档测试。
2. 截图旋转 / 方向转换？无。
3. 该前置是否在别的案例出现？本切片的坑是「文档引用实现输出必须先核对代码」，属流程类，已写在本复盘与 `patterns.md`；无设备类前置需要升级到共享模板。
