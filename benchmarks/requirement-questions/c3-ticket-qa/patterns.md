# Reusable patterns

## Fork at the latest completed turn

DSH's `sessionController.fork({ sessionId })` with no `atSeq` copies the latest completed-turn prefix and throws
`session/fork-unavailable` when the source has none. Check the reason yourself before forking (inspect the source and
look for a `turn/end`) so the failure carries a domain reason (`no-completed-turn`) rather than a remote error string.

## Read only the child's own events

A forked Session's log starts with the source's copied prefix. The boundary is `agent.session.inheritedEventCount`
(a `Session` getter; `SessionHeader` does not carry it in this DSH version). Filter `assistant/message` events with
`seq >= inheritedEventCount` so the worker's last assistant message is never mistaken for the answer. Also check for an
empty result and report `empty-answer` instead of returning an empty string.

## Decorate a fork explicitly

`Sessions.decorate` only knows the main Session and `worker-<ticketId>` Sessions; any other agent is left as it is
(or limited as a subagent). A forked Session therefore needs an explicit decorator (`Sessions.answer`) that registers
a `complete: true` prompt section in place of the preset's, restricts tools (checking each is provided, so the
whitelist cannot silently shrink), seeds the role model, sets the permission the read tools need, renames the session,
and tracks disposers in a `SessionBinding` so `agent/disposed` releases them.

## Archive once per forked Session

Put `archiveSession(forked, { stopActivity: true })` in a `finally` around everything after the fork, and log an
archive failure instead of raising it: an answer that succeeded must not become a failure because cleanup failed.
On timeout, cancel the turn first (`agent.cancel({ kind: 'user' })`) and then archive.

## Assert the absence of side effects cheaply

To prove "asking does not change the Ticket", snapshot the whole record plus the fields the requirement names
(`inputs`, `assignments`, `ended`, `updatedAt`), and count Triggers/Decisions around the thread before and after. The
port has no Engine dependency at all, which makes the guarantee structural rather than incidental.

## Extend the in-memory host, not the production code, for observability

The fixture now records per-Session events (for `inspect`/`snapshotEvents`), system-prompt sections, and
`tools.restrict` allow lists, and implements `fork` and `archiveSession`. Those captures let the spec assert the
decorator contract without reaching into `Sessions` internals.
