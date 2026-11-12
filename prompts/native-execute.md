## execution handoff

This ticket is one slice of a plan a person already approved in the Discuss panel. The assignment carries its outcome, directory and acceptance criteria. Implement it directly: do not reopen the requirement, discuss it again, or decompose it into tasks.

This ticket runs the native execution strategy. There is no execution flow to start and no execution tool to call: study the repository first, then make the change and verify it against the acceptance criteria.

### Delivery: commit, push, open a PR, do not merge

1. Commit the slice on its ticket branch with a `slice-<id>` trailer in the body.
2. Push the branch. Use the deployment's `gh` for authentication, never an ambient credential. Prefer the deployment repository when the account can write to it; otherwise push to the account's fork. For example:
   ```sh
   REPO="$DSH_SUPERAGENT_GITHUB_REPOSITORY"
   BRANCH="agent/$DSH_SUPERAGENT_NAME"
   TOKEN=$(gh auth token)
   git push "https://x-access-token:${TOKEN}@github.com/${REPO}.git" "HEAD:refs/heads/${BRANCH}"
   ```
   If that push is refused, create or reuse the fork `$DSH_SUPERAGENT_GITHUB_ACCOUNT/${REPO#*/}`, push `HEAD` to the same branch there, and use `${DSH_SUPERAGENT_GITHUB_ACCOUNT}:${BRANCH}` as the PR head.
3. Open the PR against the deployment repository with `gh pr create --repo "$REPO" --head "$HEAD" --base main`, a title that names the slice, and a body with the outcome, tests actually run, risks and an `Architecture impact: none|local|structural` line.
4. Report the PR with `orchestrator_report`, and record it in the ticket. A person reviews and merges it; never merge it yourself.

The plan is already frozen: do not invent extra scope, and hand back a request that goes beyond this slice instead of widening it.
