# Reusable patterns

## Resolve a pinned contract through a versioned registry

- Keep a map `version → mode → definition` and read the version the ticket pinned first, falling back to the current version only when the version is unknown. A later contract revision can then change defaults for new tickets without reinterpreting an old one.
- Put the pinned value in the record (`plan.execution = { mode, version }`) and the meaning in code; never let the default live in two places.

## Missing field means "the old behavior", not "the new default"

- New dispatch defaults to native, but a ticket dispatched before the field existed must keep the feature-exec flow it ran under. Resolve absence explicitly (`plan.execution ?? { mode: 'feature-exec', version: CURRENT }`) and prove it with the live ticket: this run was itself a legacy ticket, so the e1–e5 flow is the regression evidence.
- Do not backfill the field on read; absence is information.

## Degrade at the seam, once

- A strategy that needs a host service resolves to its fallback in the resolver (`featureExec` missing → native, with a `degraded` reason), not in each caller. `Sessions` and `Prompts` then only read `mode`, `tools` and `preRunGuard`, so no code path can print a prompt naming tools that do not exist.
- Keep the degrade decision pure (services in, resolved strategy out): the tests cover the matrix without a full Runtime.

## Keep the pre-change condition when adding a new one

- The pre-run guard used to exist only when `feature_exec_start` was actually in the worker's allow set. Gating it on the strategy alone would install an unsatisfiable guard on a host that registers the service but not its tools. Express the new condition as a conjunction with the old one (`strategy.preRunGuard && allow.includes('feature_exec_start')`), so "unchanged for feature-exec" is literally true.

## Test the private wiring with a recording tool scope

- A one-screen fake `Context` whose `tools.restrict`/`tools.guard` record their arguments runs the real `Sessions.workOnly`; `tools.get` returning a tool for every name keeps the allow list unfiltered. This asserts the worker-visible contract (allow list, guard message) without booting a Runtime.

## Prompt text: assert on the joined form

- `promptFile` joins each paragraph's lines with spaces, so a numbered list becomes one line and a fenced block loses its line breaks. Assertions should match the composed text (`Open the PR against ...`), not the source file's wrapping.
