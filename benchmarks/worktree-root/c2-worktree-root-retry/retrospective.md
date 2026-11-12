# Retrospective — C2 retry

## What went well

- **Checked the branch against the integration base first.** The ticket seed `5556291` contained the C2 core from `2e79202` but not the prior C2 slice delivery `f4421aa`; deployment `main` `310ae2e` already had it. Merging the integration base first kept the PR delta honest and tiny.
- **Compared the frozen criteria with the base behavior before writing code.** All six C2 criteria were already satisfied in production, so the retry delta is regression coverage instead of a duplicate implementation.
- **Fixture mirrors the host contract.** The fake `POST local/projects` now returns the same structured `projectWorktreeRoot` 400 as `src/app/http.ts`, which lets the jsdom test assert the localized toast without duplicating validation logic in the component.
- **Fresh After captures.** Reusing the committed `790f12f` Before captures and taking new After captures on the ticket branch keeps the pair real and labelled.

## Pitfalls

- **Merging deployment main introduced a docs/003 conflict.** The ticket's seed line has the `execute`-flow sentence while the integration base was edited by the C3 slice; resolving it by taking the integration base's version keeps this C2 PR free of unrelated documentation changes.
- **The dispatched implementation lane failed before producing an edit.** The same subagent runtime limitation was observed on the sibling C1 retry (two review lanes produced no output). The worker completed the contract directly and recorded the limitation in the review.
- **Environment-sensitive full-suite failures.** `GIT_CONFIG_GLOBAL`, `GIT_AUTHOR_*` and the host git locale leak into the worker shell; they reproduce on an untouched baseline. Unset them for the full gate.
- **Do not point captures at the live deployment.** A dedicated profile with a fresh `stateDir` avoids exposing real tickets and private Feishu content.

## What would make it right first time

Check whether the slice already landed on the deployment `main` before planning any production edit; if it did, make the retry a small, explicit boundary-coverage delta and record the inherited behavior per criterion.
