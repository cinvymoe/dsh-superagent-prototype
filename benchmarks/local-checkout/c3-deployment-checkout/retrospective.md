# Retrospective

- The end-to-end capture paid for itself: unit tests injected the runner and asserted the arguments the contract described, so the missing `prepare` action passed every test. Running the real script once found it immediately; the real-script test now pins the action and argument order.
- Two capture attempts failed on `#dt-page` disappearing after the successful merge: `pnpm build` inside the linked checkout makes the DSH web panel reload. Robust capture: poll `git`/the log for completion, then open a fresh page.
- Scope held: no attempt to restart or activate from the panel, no config key, no prompt changes; C4 owns the flow documentation.
