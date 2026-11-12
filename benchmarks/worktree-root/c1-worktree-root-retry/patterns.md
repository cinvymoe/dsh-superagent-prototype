# Patterns — C1 retry

## Success pattern: normalize optional string inputs before validating them

For optional path-like input, one normalization point should decide "configured or not":

- trim once, treat empty/whitespace-only as absent;
- only then validate the remaining value (absolute path, existence, permissions);
- keep the stored shape normalized, so downstream code never sees `''` or padding.

This prevents the common `value === ''` check from missing whitespace-only values.

## Success pattern: retry tickets compare the frozen clause with the inherited tests

When a retry changes acceptance semantics, search the existing tests for the old semantics. A test asserting the opposite of the new clause is the clearest signal of the delta; change it first (red) before touching implementation (green).

## Success pattern: rebase retry work onto the current integration branch

A worktree seed may lag already-merged sibling slices. Before committing, check `git merge-base` / `git diff` against the deployment main; if the seed lacks merged work or the PR diff would include unrelated files, reapply the small change onto deployment main and re-run the suite there.

## Pitfall pattern: review lanes without output

Independent review subagents can remain "running" with no message in this runtime. Give them a bounded task; if they produce nothing, interrupt them, complete the two-axis review with file/line evidence, and record the limitation instead of silently skipping review.
