# Reusable patterns

## Pin a version with the value it interprets

- `plan.execution = { mode, version }` stores the mode next to the contract revision that defines it (`execution-v1`). Resolution reads the pinned version first, so a later default or contract change cannot reinterpret an already dispatched ticket. Keep the revision a constant exported from the model, not a config value.
- Model the pinned record as one small interface (`ExecutionStrategy`) and give it one default constant; both `acceptPlan` overloads take the same optional input type, so the compiler keeps engine and evals in sync.

## Default at dispatch, never at read

- Fill the default once, when the ticket is created (`input.execution ?? DEFAULT_EXECUTION_STRATEGY`), and leave the stored field optional. Old records without it then remain distinguishable from new ones, which lets a later slice resolve legacy records with the old behavior instead of silently rewriting them.
- The idempotent reuse path must push the existing ticket and skip the create branch entirely: a repeated confirmation passing a different strategy must not touch stored state. Assert this on the persisted ticket (`repo.tickets.get`), not only on the returned array.

## Optional JSON field, no migration

- A new optional field on a JSON aggregate (`Ticket.plan`) needs no schema version bump; the marketplace's SQLite rows already tolerate absent keys. Re-check that no query reads the new path (`-> '$.plan.execution'`) before claiming migration-free.

## Prove host-sensitive failures are pre-existing

- Re-extract `HEAD` with `git archive HEAD | tar -x -C /tmp/base`, symlink the checkout's `node_modules`, and run the same spec files there. An identical failure at baseline turns an environment flake into a documented limitation instead of a papered-over red suite.
