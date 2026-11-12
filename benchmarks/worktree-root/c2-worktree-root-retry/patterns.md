# Patterns — C2 retry

## Success pattern: test-only retry delta on an already-merged slice

- Before planning edits, compare the ticket branch with the deployment integration base and check whether the slice already landed (`git log --all --grep`, `git diff <base> <branch>`).
- Map each frozen acceptance criterion to the current implementation and to a test. Where production behavior is present but the retry's clarified semantics is not locked, extend the nearest route or jsdom test rather than writing new modules.
- Keep the delta test-only and say so in the PR; the historical production commit is named in the PR body so a reviewer can verify the inherited behavior.

## Success pattern: fake server mirrors structured host refusals

- When a component handles a `UserError` code, make the fake route return the same `{ error, code }` body with the same status. The jsdom test then asserts the localized message the person actually sees. Do not reimplement validation in the fixture beyond the branch under test.

## Success pattern: fresh After captures against committed Before captures

- Keep the Before build/worktree captures committed from the original slice; capture After on the retry branch with an isolated profile, fresh `stateDir`, fixed viewport/locale/theme, and explicit revision labels in the PR.
- A test-only retry states that it changes no UI and names the production revision whose UI the After captures show.

## Pitfall pattern: retry seed behind the integration base

- A seed branch can be ahead of upstream `main` but behind the deployment integration line. Merge the integration base first, resolve only the conflicts the merge itself creates, and re-verify `git diff --quiet <base> HEAD` before adding the retry delta.
