# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

dsh-superagent is a DeepSeek Harness bundle: it reads Triggers from Sources, evaluates them under a Policy, and runs authorized Tickets in Executor Sessions. The numbered documents in `docs/` are the specification; the code follows them, not the other way round.

## Documentation pairs with a figure

`diagrams/*.html` are part of the documentation, not decoration. Each numbered document has one figure that a reader can hold in their head:

| Change touches | Update this figure |
| --- | --- |
| `docs/001-domain.md`, `src/core/model.ts`, Engine aggregates | `diagrams/domain-model.html` |
| `docs/002-authorization.md`, `src/policy.ts`, gate and admission | `diagrams/authorization-flow.html` |
| `docs/003-execution.md` § Ticket stages, `src/core/stage.ts` | `diagrams/ticket-state.html` |
| `docs/003-execution.md` § Failure and recovery, retry, restart, effects | `diagrams/failure-recovery.html` |
| `docs/006-deployment.md` § What runs, `SETUP.md`, state directory | `diagrams/deployment-topology.html` |
| `docs/003-execution.md` § Agent configuration, `src/app/agent-tools.ts`, `src/app/capabilities.ts`, panel Agents settings | `diagrams/agent-capabilities.html` |
| Roles, routing and the accepted pipeline as a whole | `diagrams/current-architecture.html` |

**Rule.** When a change alters a behaviour one of those figures draws, update the figure in the same change. If the change adds a new subsystem that no figure covers, add a figure rather than stretching an existing one past its budget.

**Do not** let a figure assert something the code no longer does. A stale diagram is worse than no diagram, because readers trust it.

## Editing a diagram

The `.html` is the source of truth; `.svg` and `.png` are exports.

1. Edit `diagrams/<name>.html`. It is self-contained: inline SVG, inline CSS, one Google Fonts `<link>`.
2. Keep the diagram contract:
   - `viewBox="0 0 1280 720"`, `role="img"`, `aria-labelledby="<slug>-title <slug>-desc"`, `<title>` first child of `<svg>`.
   - Structural geometry on the 4 px grid; node origins, widths and gaps divisible by 4.
   - Orthogonal connectors only: rounded elbows (`r=8`) or a straight line when both ends share an x or y. No diagonals.
   - Every arrow label sits on an opaque `#f5f5f5` mask with a 6–10 px gap from its stroke, never on the line, never under a node drawn later.
   - Legend is a horizontal strip at the bottom; arrows are drawn before boxes; at most 9 nodes and 12 connectors; coral (`#bf4520`) on one or two focal elements only.
   - Labels are Chinese; technical values (ids, paths, ports, tool names) stay in Geist Mono. Human-readable names use Geist sans; the page title uses Instrument Serif.
3. Re-export and verify (the diagram-design skill ships the helpers):

   ```sh
   SKILL=~/.pi/agent/skills/diagram-design   # wherever the diagram-design skill is installed
   python3 $SKILL/scripts/self_check.py diagrams/<name>.html
   python3 $SKILL/scripts/export_svg.py diagrams/<name>.html diagrams/<name>.svg
   # PNG: render diagrams/<name>.html and screenshot the first <svg> at 2×
   ```

4. Update the `文档 → 图` table in `diagrams/README.md` if a figure is added, renamed or retired, and keep the one-line description next to the document it belongs to.
5. If the document itself gains or loses a section the figure explains, add the `The figure […]` line next to that section, so the two stay linked.

## Working in this checkout

- `pnpm check` runs typecheck, tests and build. A change is not done while that fails.
- The Engine is the only writer of Triggers, Threads, Decisions, Tickets and Assignments; do not write those records from an adapter.
- User-facing refusals are `UserError` codes in `src/core/errors.ts` and are worded in the panel's locales; a new refusal needs an entry in both `locale/*.json`.
- Documentation prose is English; `diagrams/README.md` and diagram labels are Chinese, matching the panel.
