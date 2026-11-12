# Two-axis review · C2 retry · Discuss form and API expose the project worktree root

Ticket: `1478bf96058ac87a5dcf08731cb9147b` · slice `C2` of alignment `q-94e6e32e`
Base: deployment `main` @ `310ae2e`; branch tree equals `310ae2e` before this slice's test-only delta.
Diff: `tests/local-align.spec.ts`, `tests/fixtures/panel-server.ts`, `tests/panel-discuss.spec.tsx` (+59 lines, 0 deletions; no production code).

## Standards axis — PASS

- **Scope and module boundaries.** No `src/**` change. The Discuss production path already satisfies the frozen behavior in `src/app/http.ts:206`, `src/app/local.ts:53-57`, `src/client/discuss.tsx:60-65,82,94-97,184` and `src/client/locales.ts:130-131,173,429`; this slice only locks it with tests, as the retry plan intends.
- **Test quality.** The new HTTP assertions extend the existing end-to-end route test with the retry's clarified blank semantics (omitted / empty / whitespace-only → unconfigured) and check legacy records in both the list and the detail. The jsdom tests cover the form payload, the project row, the requirement detail, and the localized refusal toast. Assertions are behavioral (status, body property absence, rendered text), not implementation-coupled.
- **Fixture fidelity.** `tests/fixtures/panel-server.ts` now mirrors the host's structured `projectWorktreeRoot` refusal (400 + `code`) so the panel's error path is exercised against the same contract as `src/app/http.ts:97` (`UserError` → 400 with `code`). The fixture keeps the existing "spread only when truthy" record shape.
- **Diff hygiene.** `git diff --check` clean; no dead code, no duplicated assertions, no changes to unrelated fixtures.
- **Limitation.** The implementation lane `lane-T1-1` (subagent `e6b6e49d-8411-44ed-b636-a24f3d9222cb`) failed before producing any edit or final message in this runtime; the worker completed the same contract directly and records that process limitation here.

## Spec axis — PASS (6/6 frozen C2 criteria)

1. **`POST local/projects` with `worktreeRoot=/srv/wt` returns and persists; omitted/empty unconfigured; relative 400 with absolute-path explanation.** `src/app/http.ts:206` parses/trims the optional field; `src/app/local.ts:53-57` stores only an absolute value and throws `projectWorktreeRoot`; `tests/local-align.spec.ts:97-135` asserts valid persistence, list visibility, detail visibility, empty, omitted, whitespace-only, and the relative 400 body (`code: projectWorktreeRoot`, error containing `absolute path`).
2. **`GET local/projects` and `GET local/issues/:id` return the field; legacy records legal.** `tests/local-align.spec.ts:103-107` (new project through both routes) and `:114-135` (legacy project absent from detail/list field), plus `src/app/http.ts:218-224` returning the project object.
3. **Discuss form submits `worktreeRoot`; blank not submitted; project row shows it; zh/en copy.** `src/client/discuss.tsx:60-65` builds the payload only from a trimmed non-empty value; `:82` and `:184` render it on the project row and requirement detail; `tests/panel-discuss.spec.tsx:19-31` (payload + row), `:34-43` (empty omitted), `:61-69` (English field/hint), `:71-82` (whitespace-only omitted), `:84-99` (detail display + legacy rendering).
4. **Execution settings root hint contains “显式配置时必须已存在且可写”.** `src/client/locales.ts:429`; `tests/panel-execution.spec.tsx:111-118` opens the tooltip and asserts the literal phrase.
5. **jsdom panel tests cover payload and display; HTTP route tests cover valid/invalid; vitest and `pnpm check` pass.** The new tests above plus the existing suite; `docs/issues/evidence/verification.log` records typecheck, targeted 6 files / 58 tests, full `pnpm check`, and `git diff --check` exit codes.
6. **UI PR description carries Before (main baseline) and After (this branch) captures, same scenario/viewport/theme, labelled.** This retry changes no UI: the C2 UI landed in `f4421aa` (PR #3, merged into `310ae2e`). The PR description pairs the previously captured real baseline images (`790f12f`, `docs/evidence/c2-worktree-root/before-*.png`) with fresh real captures from this branch (`docs/evidence/c2-worktree-root-retry/after-*.png`, 1440x1100, light, zh-CN) and states the revision labels explicitly.

## Conclusion

Approve. The slice is test-only, the production behavior is the already-merged C2 delivery, and the retry delta closes the remaining boundary evidence without changing public API, schema, or deployment behavior.

Architecture impact: local (test/fixture only; `docs/007-architecture.md` module and test tables remain accurate because no test file was added).
