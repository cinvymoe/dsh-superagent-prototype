# Retrospective

## What worked

- One focused lane implemented the whole slice (record, semantics, HTTP, locale copy, panel round id, tests) and reported per-criterion test names; the ticket worker then re-ran the commands and reviewed the diff rather than trusting the report.
- Acceptance tests asserted persisted state (`store.get(...).alignments`), real Session delivery (`h.relays(sessionId)`) and HTTP status + code + values, not just return values. That caught the meaningful behaviours: the second round is appended, the feedback actually reaches the Aligner, no plan ticket exists after a stale decision.
- The legacy-record path was written as a read normalization, so no migration ran in tests or on startup.
- New error codes and their zh/en copy landed in the same change, keeping `tests/locales.spec.ts` green without follow-up churn.

## Pitfalls

1. **`main` moved twice during PR delivery.** The branch started at `40191e32`; by the time the PR opened, `main` was `32262807` and then `934a1f07` (PR #24/#25/#26/#23). Each merge only conflicted on `docs/005-panel.md`, but the merges also introduced new panel fixtures that constructed `LocalAlignment` without the new required `roundId`. Typecheck after a merge is mandatory: the type tightening in the slice surfaces in code the slice never touched.
2. **Full-suite timeouts are load, not regressions.** The first `pnpm check` timed out two unrelated specs at 5 s (`prompts`, `sources`); both pass standalone and the full retry was green. Re-run before diagnosing, and record both runs in the evidence instead of hiding the first.
3. **Panel fixture is a test double, not a second store.** The panel fixture only increments a round counter and keeps the mirror; that is fine for view tests, but do not assert history behavior against it — assert it against `LocalIssues` or the runtime.
4. **The panel must send the round it rendered.** Without `roundId`, a page left open could confirm a newer proposal. The three-line panel change is what makes the stale guard real end to end, and it needs no visual redesign.

## Follow-ups (later slices)

- Render the round history in the Discuss panel (this slice records it; the current panel shows only the current round).
- Decide whether a rejection of an already confirmed round should be refused explicitly; this slice deliberately kept the pre-existing permissive behaviour and documented it in the review.
