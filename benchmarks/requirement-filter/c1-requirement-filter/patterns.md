# Reusable patterns

## List filter as a canonical route query

- Put a filter on the list route as `query: { filter }`, but canonicalize the default bucket to "no query" in `parseRoute` and in every navigation. Route memory then stores the default as `{ page }`, and the tests can assert it.
- Use `replace` for filter clicks so the back stack does not grow; assert it through `sessionStorage['dsh-superagent/route']` (`stack` unchanged, route query as expected) instead of a visual check.
- If a detail page has an explicit back button instead of using history, carry the list's filter on the detail route (`query.filter`) and let the button rebuild the list route from it. This keeps the invariant after a deep link or reload, where the stack is empty.
- Preserve the filter when switching the scoped project by rebuilding the same route with the same query; the data hook re-runs because the project id changes.

## Disjoint status buckets

- Derive a bucket from the record state plus the alignment status and make exactly one branch win: closed first, then confirmed, then pending. Every record then lands in one bucket and `全部` is simply no filtering, which keeps the default list and the counts consistent.
- Never re-sort on the client for a status filter; filtering must only hide rows so the host's newest-first order survives.

## Two empty states

- Branch on the total record count first (`no records` → the original copy) and only then on the filtered count (`records exist, bucket empty` → a filter-specific copy). Assert both, including the English pair, to keep the locale parity test meaningful.

## Screenshot evidence with an isolated profile pair

- Clone the baseline branch, build it, copy an existing web profile, retarget its `dsh-superagent` link, and seed the SQLite `kv/local-*` rows identically on both sides; that gives same seed/viewport/theme Before/After captures without the live deployment.
- Write empty `thread.pending` in the seed so the engine does not start an Eval on boot; the panel still renders the list, detail timeline and alignment because only `kv`, `thread`, `trigger`, `trigger_thread` rows are needed.
