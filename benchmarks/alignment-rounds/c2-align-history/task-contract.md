# Task contract · C2 T1

- Stage: e2, lane `lane-T1-1` (subagent / spawn), tier T1
- Worktree: `/data/project/workspace/dsh-worktrees/slice-9475bcf31c60`
- Depends on: C1 (`agent/slice-9e69570faa5d`, PR #30) merged into the branch

## Goal

On top of C1's round model, render the alignment round history on the requirement pages.

## Files

- `src/client/discuss.tsx` — `alignmentRounds`/`currentAlignment` read side, `AlignmentBody`, `AlignmentRoundMeta`, `EarlierAlignmentRound` (via `DisclosureRow`), per-round `statusTag`, list-row round count, decision with `roundId`.
- `src/client/locales.ts` — `discuss.roundsCount`, `discuss.roundLabel`, `discuss.roundCurrent`, `discuss.roundsEarlier`.
- `src/client/client.css` — `.dt-round`, `.dt-rounds-history`, `.dt-round-label`, `.dt-round-note`.
- `tests/fixtures/panel-server.ts` — propose/decision keep `alignments` + mirror in step, supersede, stale refusal, collision-free ids, `alignmentConfirmed`.
- `tests/panel-discuss.spec.tsx` — four tests (row count, two-round detail, decision roundId, stale refusal).
- `tests/docs.spec.ts`, `docs/005-panel.md`, `docs/007-architecture.md` — document and assert the round history.

## Acceptance

- Current round expanded with summary/slices/acceptance; earlier rounds collapsed with status/time/reason and expandable to their body.
- Round count on the list row; none without an alignment.
- Confirm/Send back only on the current `proposed` round, decision body carries `roundId`.
- Bilingual keys and the panel doc row; targeted tests and typecheck green.

## Verify

```sh
pnpm vitest run tests/panel-discuss.spec.tsx tests/locales.spec.ts tests/docs.spec.ts tests/local.spec.ts tests/local-align.spec.ts
pnpm typecheck
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

## Notes

- The runner already held the implementation when the lane ran, so the lane was an independent verification lane (read-only) rather than a fresh implementation lane; it confirmed 4/4 criteria and found the staged-index hygiene issue that was fixed before the merge commit.
