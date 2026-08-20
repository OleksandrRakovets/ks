# MatchRoom deployment

`@ks/match-room` hosts the SQLite-backed `MatchRoom` Durable Object independently from Play. It owns active-match sequencing, facts, projections, command receipts, current SSE fan-out, and terminal local disposal. It does not bind D1 or import Play/application code.

The Worker currently has no public gateway. Play reaches named objects through its external Durable Object binding; the current browser SSE request is proxied by Play. The deferred direct gateway and hibernatable WebSocket replacement are specified in the [live transport spec](../../.tracker/match-live-websocket-spec.md).

The project has not yet been deployed. First deployment creates a clean `new_sqlite_classes` namespace: deploy `ks-match-room` before deploying Play's `script_name: "ks-match-room"` binding. See the [current architecture](../../.tracker/decisions/current-architecture.md) and [database guide](../../.tracker/db.md).

## Commands

- `bun run build` — produce a Wrangler dry-run bundle.
- `bun run typecheck` — regenerate Worker types and type-check the workspace.
- `bun run test` — run MatchRoom tests.
- `bun run dev` — run this Worker directly; normal combined development starts from the repository root.
