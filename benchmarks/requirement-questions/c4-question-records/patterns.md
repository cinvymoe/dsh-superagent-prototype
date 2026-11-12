# Reusable patterns · C4

## Records plus a background queue on an existing record

When a feature must answer asynchronously but its state belongs on an existing record, keep the record write synchronous and
queue the work in a microtask:

```ts
const updated = { ...issue, questions: [...questions, record], updatedAt: at }
this.host.local.putIssue(updated)
this.queue(issueId, record.id)      // Promise.resolve().then(() => this.answer(...))
return { issue: updated, question: record }
```

This keeps the HTTP response honest (`asked`) without making the caller wait, and `idle()`/`stop()` give tests and shutdown a
single place to wait. A `Map<key, Promise>` keyed by record id is enough for de-duplication; deleting the key in `finally`
keeps `idle()` loopable while new work is queued.

## Re-read before settle

`answer()` re-reads the requirement and only rewrites the target record when it is still `asked`. The read-modify-write is
synchronous, so a comment or alignment edit that happened during the `await` survives. Retry re-uses the same record id, so a
late answer for the previous attempt cannot clobber the new one.

## Distinguish "interrupted" from "failed"

On `lifetime.aborted` or a stopping flag, write nothing: the record stays `asked`, and the next start's `resume()` retries it.
Writing `failed` here would permanently hide a healthy question behind a restart.

## Prove "not in the Engine" directly

Snapshot the Ticket (`structuredClone`) and the Trigger/Decision counts before and after, and compare only the fields the
feature could plausibly touch (`inputs`, `assignments`, `ended`, `updatedAt`). That is stronger than asserting "no writes"
because it catches incidental `updatedAt` bumps from other paths.

## Seedable restart tests

`startRuntime(seed)` writes the store before the Runtime opens it, so a restart can be simulated without a second directory:
seed the record (`asked`) and the Ticket, let `initialize()` re-queue it, then `await runtime.localQuestions.idle()` and assert
the record is no longer `asked` and carries the port's failure reason (the fixture has no worker Session).
