# C2 regression case: requirement image storage and reading (server side)

- Ticket: `7d197b3b2d9b27eb816cac184ca71255` (slice C2 of alignment `q-612052e8`)
- Branch: `agent/slice-7d197b3b2d9b`
- Base: `afab266e` (deployment `main`)
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/14 (state OPEN, not merged by the agent)
- Scope: `POST local/issues` carries up to four PNG/JPEG/WebP/GIF images (≤5 MiB each, base64 JSON), validates the whole set before creating anything, stores bytes under `<stateDir>/local-images/<issueId>/`, records `{id,name,mediaType,bytes}` on the issue, appends absolute paths to the requirement trigger text, serves stored bytes at `GET local/issues/:id/images/:imageId`, and keeps 128 KiB on every other route.

## Artifacts

| Artifact | Path |
| --- | --- |
| Task contract | `task-contract.md` |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Two-axis review | `review.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Raw verification log | `evidence/verification.log` |

## How to re-run

```sh
pnpm typecheck
pnpm vitest run tests/local.spec.ts tests/local-align.spec.ts tests/http.spec.ts tests/locales.spec.ts tests/docs.spec.ts tests/class-docs.spec.ts
env -u GIT_CONFIG_GLOBAL -u GIT_AUTHOR_NAME -u GIT_AUTHOR_EMAIL -u GIT_COMMITTER_NAME -u GIT_COMMITTER_EMAIL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck clean; targeted 6 files / 47 tests; full `pnpm check` passes (63 files / 1257 tests + build).

## Visual evidence

Not applicable: this slice changes no UI. The Discuss upload/display UI belongs to a separate slice of the same alignment.
