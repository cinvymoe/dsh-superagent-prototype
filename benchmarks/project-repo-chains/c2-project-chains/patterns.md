# Reusable patterns

## A project owns its GitHub chain by id

- A local project's chain id is the project id (`p-<8 hex>`), which already satisfies the lowercase-kebab-case chain-id rule, so no mapping table is needed.
- `POST local/projects` appends `{id: project.id, intakeRepository, codeRepository}` to `settings.sources.github.config.chains`; `PUT local/projects/:id` replaces only the row whose `id === project.chain` and keeps other row objects untouched. Existing rows can be compared with `toEqual` before/after in tests.
- The project record stores `chain`, `intakeRepository`, `codeRepository`; `repository` remains only as the legacy fallback.

## Reuse `Settings.save` as the repository-access gate

- `Settings.save('source:github', {enabled, config}, revision, 'panel')` runs `Setup.checkAccounts → resolveDeployment` before `store.atomic`; an unreadable intake repository (`repositoryUnreadable`) or unpushable code repository (`repositoryReadOnly`) throws `SetupError`, which the HTTP layer maps to 400. Do not duplicate `gh api repos/...` probing in the project path.
- To keep "no failed artifacts", validate names/repository formats first, write the project record, then save the chain; delete the record in the catch. Alternatively save the chain first and roll back; either way the observable final state must be asserted.

## Resolve a runtime-added chain without a restart

- `Setup.deploymentFor(chain)` only knows chains resolved at startup. For a project chain added since startup, read `settings.sources.github.config.chains` and build `{...base, chain, repository, intakeRepository}`; the resolved deployment wins once available. `ticketExecution` then writes `execution.chain` and both environment variables.

## Idempotent startup binding

- On startup, walk projects without `chain`/`codeRepository` and find the first chain whose `codeRepository === project.repository`; write back `chain`, `intakeRepository`, `codeRepository` and keep `repository`. Skip already-bound projects so a second pass is a no-op; never write settings in this pass.

## Docs and tests drift together

- `tests/docs.spec.ts` asserts exact phrases in `docs/005`/`docs/007` and the module/test tables. Adding `src/app/projects.ts` requires a module-table row; changing the project's repository wording requires updating the two documentation assertions.
