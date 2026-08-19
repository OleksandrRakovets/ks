# MatchRoom deployment

`@ks/match-room` hosts the `MatchRoom` Durable Object independently from Play. It has no public gateway in this slice; Play reaches it through its external Durable Object binding.

The clean first-deployment namespace and deployment order are recorded in the [runtime architecture decision](../../.tracker/decisions/application-do-runtime-architecture.md).

## Commands

- `bun run build` — produce a Wrangler dry-run bundle.
- `bun run typecheck` — regenerate Worker types and type-check the workspace.
- `bun run dev` — run this Worker directly; normal combined development starts from the repository root.
