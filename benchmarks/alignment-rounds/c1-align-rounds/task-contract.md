# Task contract · T1 · alignment rounds and rejection feedback (host side)

## Context

- Alignment issue `q-29218185`, slice `C1`; frozen acceptance in `requirement.md` and `docs/issues/9e69570faa5da701611f346b4232b0f1.md`.
- Worktree `/data/project/workspace/dsh-worktrees/slice-9e69570faa5d`, branch `agent/slice-9e69570faa5d`.
- One lane (`lane-T1-1`, subagent spawn) implemented; the ticket worker reviewed, merged `main` twice, verified and opened the PR. The lane did not commit or push.

## Goal

Turn the single `LocalIssue.alignment` slot into an append-only round history and make every piece of the alignment lifecycle round-aware:

1. **Record model** (`src/sources/local-format.ts`)
   - `LocalAlignment.roundId: string`; status adds `superseded`.
   - `LocalIssue.alignments?: LocalAlignment[]` (oldest first) plus `alignment` as the current-round mirror.
   - `alignmentRounds(issue)` normalizes legacy records (a single slot without a round id reads as `al-1`); `currentAlignment(issue)` returns the last round.
   - `LocalIssues.get`/`list` return the normalized view; storage is written as `alignments` + mirror, never bulk-migrated.
2. **Proposal** (`src/app/local.ts` `propose`)
   - Append `al-<n>` (n = rounds + 1, skipping used ids); every previous `proposed` round becomes `superseded`; rejected/confirmed rounds keep their outcome.
   - If the current round is `confirmed`, throw `UserError('alignmentConfirmed')` and write nothing.
3. **Decision** (`decide(id, decision, reason?, roundId?)`)
   - With a `roundId` that is not the current round, throw `UserError('alignmentRoundStale', { round })` before writing or dispatching.
   - `confirm`: current round only; no slices → `planEmpty`; already confirmed → idempotent return without changing `decidedAt`; otherwise `confirmed` + `decidedAt`.
   - `reject`: `rejected` + `decidedAt` + trimmed `reason`; only the first rejection of a round posts a human local Trigger (`host.receive(localTrigger(...))`) whose text contains the reason; repeated rejects do not post again.
4. **Dispatch** reads the current round everywhere: `planInput`, `Runtime.dispatchPlan`, `orchestrator_align` (return shape unchanged).
5. **HTTP + errors**: decision body accepts optional `roundId`; `src/app/api.ts` synchronized; `alignmentConfirmed`/`alignmentRoundStale` in `USER_ERRORS` with zh/en `userError.*` copy; panel decisions send the round they rendered.
6. **Tests**: unit rounds/legacy/repeat-confirm; runtime reject-feedback delivery via `h.relays(sessionId)`, latest-round dispatch, stale round over HTTP, re-align after confirm.

## Not allowed

- No changes outside the alignment path (execution strategy, project chains, images, prompts, Policy/Router).
- No schema/DDL migration; no new dependency.
- No commit/push from the lane; no edits under `docs/issues/`.

## Verification

```sh
pnpm typecheck
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/locales.spec.ts
pnpm vitest run tests/panel-discuss.spec.tsx tests/http.spec.ts tests/docs.spec.ts
git diff --check
```
