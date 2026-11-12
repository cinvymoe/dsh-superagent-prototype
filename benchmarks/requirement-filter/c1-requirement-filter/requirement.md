# Requirement

Source: Discuss alignment issue `q-ebb66317`, slice C1. Trigger text:

> 需求列表 根据处理 情况进行 筛选显示 默认显示 待处理

The Requirements page listed every requirement of the current project, mixing pending work with confirmed and closed ones. The slice adds a processing-status filter row and opens the list on 待处理.

## Frozen acceptance criteria

- With no route filter, the list shows only open requirements with no alignment, a pending proposal or a rejection; confirmed and closed ones are hidden; the 待处理 pill has `aria-pressed=true` and the Section count equals the displayed rows.
- The filter row shows 待处理/已确认/已关闭/全部 in that order in zh and en; a click replaces the route entry (pending writes no filter query), shows only that bucket newest first, and 全部 shows every requirement of the project.
- Opening a requirement detail from a non-default filter and returning keeps the filter; switching projects on the list keeps it and refetches for the new project.
- A non-empty project with an empty bucket shows the new empty copy; a project without requirements keeps the original copy; the detail and New requirement pages behave unchanged.
- `pnpm typecheck`, `pnpm test` and `pnpm build` pass; `pnpm check` exits 0.
- `docs/005-panel.md` names the four filters and the default 待处理; no new modules or test files; the 007 architecture tables stay unchanged.
- The PR carries same-viewport/theme/seed Before/After captures of the default list, a non-default filter and the filter kept after a detail returns.
