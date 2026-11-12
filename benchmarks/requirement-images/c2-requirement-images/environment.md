# Test environment

- Node 22.23.1, pnpm 11.7.0; dependencies installed with `pnpm install --frozen-lockfile` in the ticket worktree.
- No device, GUI, screenshot, rotation or physical-resolution prerequisite: this slice is server-side logic and integration tests over the simulated DSH host.
- Tests write into per-test temporary `stateDir` directories (`mkdtempSync`), so requirement images never touch a real installation during tests.
