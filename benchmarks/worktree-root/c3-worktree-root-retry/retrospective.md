# Retrospective — C3 retry

## What went well

- **Checked the integration base before editing.** The ticket seed `5556291` predates deployment `main` `66604aa`, which already contains two C3 documentation commits (`f2f9ebe`, `4b2d3d0`). Merging `main` first made the delta honest: four small wording/semantics gaps against the frozen criteria, not a duplicate docs rewrite.
- **Frozen criteria drove the exact sentences.** Each `tests/docs.spec.ts` assertion maps to one acceptance criterion, and each document sentence was written to the criterion instead of to the existing (partly stale) prose.
- **Panel labels checked against source.** `docs/005` now uses the labels and hints from `src/client/locales.ts` (`discuss.projectName`, `discuss.projectRepository`, `discuss.projectWorktreeRoot`, `executionDirectory`), so "matches the panel's actual fields" is verifiable rather than assumed.
- **Full suite green in a clean environment.** `env -u GIT_CONFIG_GLOBAL … LC_ALL=C pnpm test` passes 62 files / 1245 tests, so no environment-failure caveat is needed in the PR.

## Pitfalls

- **`tests/docs.spec.ts` asserts exact prose.** Line wrapping is fine because `prose()` collapses whitespace, but any sentence rewrite breaks the assertion. The mitigation is to assert the criterion sentence, not an incidental phrase.
- **The earlier C3 attempt's branch is stale.** PR #6 (`agent/worktree-1e2ca41e46a5`) predates the `Clear filters` docs and would revert that line if merged; starting from current `main` and keeping the delta narrow avoids that regression.
- **The dispatched implementation lane failed before producing an edit.** `lane-c3-docs-1` ended with no edits and no closing message; the worker completed the same contract directly and recorded the limitation in the review.
- **Overwriting `docs/issues/review.md` would erase the C2 record.** Use a slice-specific review file (`review-C3-retry.md`) instead of reusing the previous slice's filename.

## What would make it right first time

When a documentation slice has already partially landed on the integration base, diff the four target documents and `tests/docs.spec.ts` against each frozen criterion before writing anything; then the retry is a short, criterion-by-criterion patch instead of a second full documentation pass.
