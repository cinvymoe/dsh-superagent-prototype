# Review pointer · C4

The two-axis review and the per-criterion evidence are in `docs/issues/review-C4-flow.md`.

- Standards: document layering (006 flow / 005 panel / 007 reload boundary), every output and exit code checked against `scripts/dsh-superagent`, `src/app/prepare.ts` and `src/client/deployment.tsx`, link direction respected, assertions pin semantics rather than layout, no code or prompt change.
- Spec: the four frozen criteria pass; the review table cites the sections and tests.
- Corrected during review: the intentional-stop output quoted in the assignment (`…activation is skipped.`) does not match the implementation (`…activation skipped.`, `scripts/dsh-superagent:426`); the documentation follows the implementation.
