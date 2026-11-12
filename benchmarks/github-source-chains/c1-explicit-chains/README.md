# C1 回归案例：GitHub Source 只保留显式仓库链路

- Ticket: `e98e00c734ae15fdffa3950e7bbbda0a`（alignment `q-141a6a1e` 的 C1 slice）
- Branch: `agent/github-source-e98e00c734ae`
- Base: deployment `main` @ `04cb0449`
- PR: https://github.com/cinvymoe/dsh-superagent-prototype/pull/11 （OPEN；由人复核合并，未启用 auto-merge）
- Scope: 删除 GitHub Source 的旧版单链路（`repository` / `intakeRepository` / `codeRepository` 回退），`chains` 成为唯一配置；旧形状已存配置读取时归一化为 `id=default` 链路，面板保存一次后只存 `chains`；Source 设置卡删除三个旧字段；`docs/003`、`docs/006` 同步。

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
| Raw verification logs | `evidence/c1-check.log`, `evidence/c1-targeted.log` |
| Real panel Before/After captures | `docs/evidence/c1-github-chains/` |

## How to re-run

```sh
env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm typecheck
env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm vitest run tests/deployment.spec.ts tests/sources.spec.ts tests/panel-source.spec.tsx tests/runtime.spec.ts tests/model-surface.spec.ts tests/policy.spec.ts
env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm check
git diff --check
```

Expected: typecheck clean; targeted 6 files / 530 tests; `pnpm check` 63 files / 1252 tests + build; diff-check clean.

## Visual evidence

- Before: `docs/evidence/c1-github-chains/before-source.png`, `before-source-advanced.png` — real panel build of deployment `main` @ `04cb0449`, 1440×1100, light, zh-CN, with a stored legacy-shaped GitHub config (`repository=acme/widgets`, `intakeRepository=acme/intake`, `codeRepository=acme/widgets`).
- After: `docs/evidence/c1-github-chains/after-source.png`, `after-source-advanced.png` — real panel build of this branch, same seeded state/scenario/viewport/theme/locale; the legacy config is displayed as one `default` chain and the legacy fields are gone.
