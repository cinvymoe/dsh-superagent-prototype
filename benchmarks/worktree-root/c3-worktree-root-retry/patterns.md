# Patterns — C3 retry

## Success pattern: criterion-first documentation patch

- Read the frozen acceptance criteria as literal requirements for the documentation, then grep the target documents for the corresponding sentences.
- Where a criterion asks for a priority, use an explicit chain (`A > B > C`) rather than an ordinal narration ("in this order: A, then B, then C"); the chain is unambiguous and testable.
- Keep every existing correct sentence (prepare cwd, no-fallback, retry) untouched and only replace the stale wording; the diff stays small and reviewable.

## Success pattern: document only what the panel shows

- When a criterion says "matches the panel's actual fields", read the labels and hints from `src/client/locales.ts` and the field names in the component (`src/client/discuss.tsx`, `src/client/execution.tsx`).
- Name both the panel label (**Ticket directory root**) and the stored key (`executor.directory`), and state the empty-value default, so readers can map UI to configuration.

## Success pattern: prose assertions with whitespace collapsing

- `tests/docs.spec.ts` uses `prose(path).replace(/\s+/g, ' ')` so a sentence can be asserted regardless of Markdown line wrapping. Assert whole criterion sentences; never assert fragments that include only the variable parts.

## Pitfall pattern: retry seed behind the integration base

- A ticket worktree can be seeded from a commit that predates the deployment integration line; merging `main` first is required. After merging, `git diff <base> HEAD` must be empty before the retry delta is added, otherwise the PR mixes inherited commits with the retry.

## Pitfall pattern: stale sibling PR for the same slice

- An earlier attempt at the same slice may still be open against an older base (here PR #6). Do not adopt it or push to it; deliver the current-base version and let a person close the stale one, and say so in the PR body so the reviewer is not surprised.
