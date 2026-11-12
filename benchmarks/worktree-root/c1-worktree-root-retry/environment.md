# Test environment prerequisites — C1 retry

Not applicable: this case is pure application logic plus unit/integration tests. No device, GUI, screenshot, screen orientation, rotation command, or physical test environment is involved.

Host prerequisites actually used:

- Node v22.23.1 + pnpm 11.7.0 from the worker environment; `node_modules` installed with `pnpm install --prefer-offline`.
- Full-suite command runs as `env -u GIT_CONFIG_GLOBAL LC_ALL=C pnpm test` because the host exports `GIT_CONFIG_GLOBAL` and a Chinese locale, which break two pre-existing environment-sensitive tests unrelated to this change.
- Evidence path: `evidence/verification.log`.
