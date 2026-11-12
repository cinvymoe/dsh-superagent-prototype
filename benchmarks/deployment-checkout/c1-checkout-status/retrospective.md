# Retrospective

## What the slice had to get right

The route is the read side of "merge locally and take effect": it must answer whether the checkout the running plugin was loaded from can receive a merge, and whether the code on disk already moved past what this process started on. Both answers are only useful if they come from local git state, never from the network, and if a "safe" verdict is never given on an unread tree.

## Pitfalls, how they were hit, how they were fixed

1. **The start snapshot raced the test's own disk changes.** The first `restartRequired` cases constructed a `Checkout`, immediately committed (or deleted a file), then called `status()`: the constructor's git processes sometimes read the *new* state, so "started clean" fixtures reported `restartRequired: true` by accident, or the dirty-start fixture found a clean tree. Fixed in two ways: behavioural cases `await checkout.status()` once before touching the disk, which proves the change is seen afterwards; and a separate case proves the reading really starts at construction by injecting a recording runner and waiting (`vi.waitFor`) for a call before any `status()`.
   Lesson: when a class captures "the world at construction", do not test that capture by mutating the world immediately after construction — force the capture, then mutate.

2. **Detached HEAD was read with `rev-parse --abbrev-ref HEAD`.** It prints the literal string `HEAD`, so the first implementation reported `branch: 'HEAD'` and `notMain` instead of `detached`. Fixed by reading `symbolic-ref --quiet --short HEAD`, whose non-zero exit is the detached signal.

3. **`noRepository` leaked into the detached and non-main fixtures.** Those repositories had no remote, so their readings correctly carried `noRepository` *and* the code under test. Fixed by giving those fixtures an https remote; the reason codes are then isolated per case.

4. **`git status --porcelain` was path-limited.** The first version ran the later commands in the package directory handed in; a package root below the checkout root made `status` report only that subdirectory, so a modified file elsewhere read as clean. Fixed by running every command after `rev-parse --show-toplevel` at the repository root.

5. **The read-only assertion contradicted the remote read.** The forbidden-word list contained `remote`, but the read legitimately asks for the config key `remote.origin.url`. Fixed by comparing whole argv items instead of substrings, and by keeping the subcommand allow list (`CHECKOUT_GIT`) as the structural guard.

6. **The panel fixture's `ROUTES` map is exhaustive over `Api`.** Adding the route broke `pnpm typecheck` (`TS2741`) until the fake API answered it. Fixed with one static answer and a comment; the fake is a fixture, not a page.

7. **The host restarted mid-ticket after the PR was opened.** On resume, the worktree (clean at `e9dafa41`), the PR (#28, `MERGEABLE`/`CLEAN`) and the run stage (e4 passed) were inspected before doing anything; nothing was pushed or opened twice, and only the sediment step remained.

8. **`orchestrator_report` rejected the PR number.** The report with `pr_number: 28` came back "PR does not belong to this ticket", although the PR sits on `agent/get-deployment-checkout-2b9bf67f6fd82b0720ed7644ef721c67` and was opened by `rust-crane-agent[bot]` (the same shape as PR #20). Reported without `pr_number` and said so in the summary, leaving the association to the host's head-branch recovery.

9. **The merge was pushed to a mistyped branch name.** The push target was written as `agent/get-deployment-checkout-<full ticket id>` instead of `agent/get-deployment-checkout-<short ticket name>` (the deployment names branches `agent/$DSH_SUPERAGENT_NAME`, a 12-hex-char short name). The push reported success, a distant branch was created, and the PR kept saying `CONFLICTING`. Diagnosed by comparing `git ls-remote` and the GitHub refs API with the PR's `headRefName`; fixed by pushing `HEAD` to the real branch and deleting the stray one. Lesson: after a push that should change a PR, verify the PR's `headRefOid` (or `git ls-remote` of the exact ref), never only the push output.

## What a later slice inherits

- `repository` reads the `origin` remote only. This deployment's plugin checkout has `origin` on the upstream `deepseek-ai/dsh-superagent-prototype` while the pull request target sits in a remote named `deployment`, so the merge action must compare with the deployment repository instead of trusting `available`.
- A repository with no readable `HEAD` (empty) reports `head: null` with no reason code; the merge slice should treat it as unavailable.
- The route needs no completed setup; it answers while setup is pending, which is what a deployment page wants.

## Test environment answers

1. No physical device, GUI, cross-build or screenshot is involved: Node + vitest over temporary git repositories.
2. No rotation or direction conversion is needed; nothing is captured from a screen.
3. The environment prerequisites are recorded once in `environment.md` (and in the earlier C2 case for the same toolchain); the only recurring environment fact is the injected `GIT_CONFIG_GLOBAL` with `useConfigOnly = true`, which requires explicit commit identities in tests and in commits.
