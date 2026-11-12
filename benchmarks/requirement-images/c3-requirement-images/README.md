# C3 regression case: panel requirement images

- Ticket: `fd4370f4967a89692063df8d02daa80c` (slice C3 of alignment `q-612052e8`)
- Branch: `agent/slice-fd4370f4967a`
- Base: stack `fe2bb2e9` (deployment `main` @ `afab266e` + unmerged C1 #12 + C2 #14)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/15 (OPEN, stacked on #12/#14, not merged by the agent)
- Scope: the panel side of requirement images — multi-select picker with thumbnails/names/removal and limits hint, description+images in one create request, ordered detail gallery read through the same-origin byte API with an object URL, list-row image count, local type/size refusal, and host-refusal retention of the form.

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Task contract | `task-contract.md` |
| Two-axis review and criteria evidence | `review.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Raw verification log | `evidence/verification.log` |

## How to re-run

```sh
pnpm typecheck
pnpm vitest run tests/panel-discuss.spec.tsx tests/local.spec.ts tests/local-align.spec.ts tests/http.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/styles.spec.ts tests/controls.spec.tsx
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck exit 0; targeted 8 files / 76 tests; full `pnpm check` 63 files / 1274 tests + build; `git diff --check` clean.

## Visual evidence

- Before: `docs/evidence/c3-requirement-images/before-*.png`, stack `fe2bb2e9` (C1+C2, no C3), real panel, 1440×1100, light, zh-CN.
- After: `docs/evidence/c3-requirement-images/after-*.png`, branch head `184c51ab`, same scene/viewport/theme/language.
- Pairs: New requirement form (no image control → picker + two chosen images), Requirement list (no count → “2 张图片”), Requirement detail (text only + image paths in timeline → ordered gallery with captions, duplicate description gone).
