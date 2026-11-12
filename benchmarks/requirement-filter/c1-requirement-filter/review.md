# Review summary

Two-axis review: **Standards approve**, **Spec PASS on every frozen criterion**. Full text and the criterion-to-evidence table live in `docs/issues/review-C1-requirement-filter.md`.

- Standards: filter type/route query in `route.ts`, bucket logic and rendering in `discuss.tsx`, project-switch retention in `projects.tsx`; one data source (`GET local/issues?project=`), client-side hiding only; canonical `pending` query; type-safe route narrowing; `Pill` `aria-pressed`; DOM- and sessionStorage-based assertions.
- Spec: default pending only (proposed shown, confirmed/closed hidden, count = rows); pill order and zh/en labels; replace semantics and pending's query-less route; 已关闭/全部 subsets newest first; detail back keeps the filter; project switch keeps it and refetches; both empty states; `pnpm check` exit 0 (63 files / 1298 tests + build, after merging main `40191e32`); 005 doc updated, no new module/test files, 007 unchanged.
- Findings: added the English label/empty-copy test; merged current main before building; capture timing fixed (transient 0-count read).
