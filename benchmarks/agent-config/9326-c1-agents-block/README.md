# C1 regression case: the three-role `agents` settings block and its management API

- Ticket: `9326a1747b59254c13ccd91f49aa4028`（slice C1 of alignment `q-b03a9391`）
- Branch: `agent/agent-api-9326a1747b59`
- Base: deployment `main` @ `934a1f07`; merged `main` @ `422a21a4` before delivery
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/34（state OPEN，等人复核合并，未启用 auto-merge）
- Scope: a new `agents` settings block for the main Session, the aligner and the executor — each with an optional `model` override and the optional tools it turns off — plus its tool catalog, save validation, `GET settings` view, history diff, error codes and docs. No running Session's behavior changes (runtime application is C2; the panel page is C3).

## Artifacts

| Artifact | Path |
| --- | --- |
| Requirement snapshot / frozen acceptance | `requirement.md` |
| Task contract | `task-contract.md` |
| Two-axis review | `review.md` |
| Test environment prerequisites | `environment.md` |
| Retrospective (pitfalls and fixes) | `retrospective.md` |
| Reusable patterns | `patterns.md` |
| Attempt log | `attempt-log.md` |
| Verification evidence | `evidence/`（targeted log、full `pnpm check` log、验收对照）|

## Verify now

```sh
pnpm vitest run tests/agent-config.spec.ts tests/policy.spec.ts tests/settings.spec.ts tests/http.spec.ts tests/locales.spec.ts tests/docs.spec.ts
pnpm typecheck
pnpm check   # clean host env; see environment.md
```
