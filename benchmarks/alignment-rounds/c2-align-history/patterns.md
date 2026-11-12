# Reusable patterns · C2 panel round history

## One reader for the current round, one for the history

`alignmentRounds(issue)` (oldest first) + `currentAlignment(issue)` make the panel and the host agree on which round is current. The list row uses the last element for its tag and slice count, the detail uses `rounds.at(-1)` for the expanded block and `rounds.slice(0, -1).reverse()` for the collapsed history. Never read `issue.alignment` directly in the UI: it is only the mirror.

## Reuse `DisclosureRow` for collapsed history

`DisclosureRow` already provides `role="button"`, `aria-expanded`, Enter/Space handling and the chevron swap. Reusing it kept the earlier-round collapse accessible without a bespoke disclosure implementation; the round note (status, decisive time, reason) is its `collapsedContent`.

## Ask for one decisive time, not both

For a collapsed sent-back round, `decidedAt ?? proposedAt` answers "when was this round settled" without repeating two identical relative times; the expanded body keeps both timestamps for full detail.

## Keep the fixture faithful to the host contract

A panel fixture that only mutates the `alignment` mirror drifts from the round model as soon as the UI reads `alignments`. Mirror both, supersede an undecided round on propose, refuse `alignmentConfirmed`, allocate collision-free `al-<n>` ids, and refuse a stale `roundId` with `values.round` — then the panel tests exercise the same protocol the host implements.

## A page's decision names the rendered round

`decide()` derives the round from the current render (`currentAlignment(issue)`) and posts its `roundId`; the buttons only exist on a `proposed` current round. A page left open behind a newer proposal is then refused by the host instead of silently confirming the newer round.
