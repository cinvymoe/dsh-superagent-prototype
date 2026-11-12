# Patterns

- **Facts / judgement / action split**: `checkout.ts` reads, `prepare.ts` judges and acts, HTTP maps errors, the panel renders. Keep a new capability on the same seam instead of growing the route.
- **One start reading**: `Prepare` takes the Runtime's `Checkout` rather than constructing its own, so `restartRequired` has a single source.
- **Read every remote for chain matching**: `origin` may be the upstream; resolve every `remote.<name>.url` and compare the chain's code repository.
- **Logs outside the checkout**: the script refuses a dirty tree; a log inside it would make the checkout dirty. Use `<stateDir>/prepare/`.
- **Single flight before the first await**, and let the script's own `operation.lock` be the cross-process gate.
- **Persistent failure UI**: a toast is not enough for a script tail and a log path; render them in the section that owns the action.
