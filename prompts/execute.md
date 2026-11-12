## execution handoff

This ticket is one slice of a plan a person already approved in the Discuss panel. The assignment carries its outcome, directory and acceptance criteria. Do not reopen the requirement, re-discuss it, or decompose it again.

The host exposes the feature-exec tools (`feature_exec_*`) for this ticket. Your **first action** must be `feature_exec_start({flow: 'execute', issueId: '<alignment issue>:<slice>', scope: 'shared', product: 'shared', path: 'docs/issues/<ticket-id>.md', policy: 'A1'})`. Do not inspect the repository, run `pwd`, or read files first; the guard refuses those tools until the run starts. Only when `feature_exec_start` is absent from your tool list may you implement the slice directly.

- Then write the slice issue as `docs/issues/<ticket-id>.md` with the requirement text, a `## 验收标准（冻结版）` section containing every acceptance criterion, and a `## 任务拆解` section naming this slice.
- At e1 sign `execution-approved` with evidence that the person confirmed the alignment in the Discuss panel, then `feature_exec_advance`.
- At e2 record one task with `feature_exec_plan` and dispatch it with `feature_exec_dispatch`. The assignment's `Dispatch cwd` is the worktree to pass as `cwd`; never guess it from the ticket id. `dispatch-recorded` passes after a lane exists.
- Follow e2–e4 with `feature_exec_gate` (evidence) and `feature_exec_advance`; report progress through `orchestrator_report` as the lane runs.

### Delivery: commit, push, open a PR, do not merge

At e4 the run delivers an **open** PR, not a merged one. The gate is `pr-opened`, so do not wait for a human to merge and do not merge it yourself.

1. Commit the slice on its ticket branch with a `slice-<id>` trailer in the body.
2. Push the branch. Use the deployment's `gh` for authentication, never an ambient credential. Prefer the deployment repository when the account can write to it; otherwise push to the account's fork. For example:
   ```sh
   REPO="$DSH_SUPERAGENT_GITHUB_REPOSITORY"
   BRANCH="agent/$DSH_SUPERAGENT_NAME"
   TOKEN=$(gh auth token)
   git push "https://x-access-token:${TOKEN}@github.com/${REPO}.git" "HEAD:refs/heads/${BRANCH}"
   ```
   If that push is refused, create or reuse the fork `$DSH_SUPERAGENT_GITHUB_ACCOUNT/${REPO#*/}`, push `HEAD` to the same branch there, and use `${DSH_SUPERAGENT_GITHUB_ACCOUNT}:${BRANCH}` as the PR head.
3. Open the PR against the deployment repository with `gh pr create --repo "$REPO" --head "$HEAD" --base main`, a title that names the slice, and a body with the outcome, tests actually run, risks and an `Architecture impact: none|local|structural` line. Report the real PR number and URL with `orchestrator_report progress`, and record `pr_status: open` plus `pr_arch_impact` in the issue file.
4. Sign `pr-opened` and `arch-impact-line` with the PR URL as evidence. A push/PR failure is a blocker, not a reason to merge locally.

The execute flow ends after the open PR and the sediment step. A person reviews and merges it; never push to a repository the deployment does not own, and never merge on your own.

Without the feature-exec tools, implement the slice directly as a normal worker, use the assignment's directory, commit, push and open a PR the same way, and use the same acceptance criteria. Never invent extra scope because the plan is already frozen.
