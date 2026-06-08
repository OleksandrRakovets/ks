# Current Architecture

This file captures the architecture constraints that still matter while the roadmap evolves.

## Runtime Shape

- Production runtime stays a single React Router worker on Cloudflare.
- Route modules stay thin orchestration layers.
- Business logic lives in shared domain services, not inside routes.
- Do not add same-process HTTP hops by default.
- D1 is the persistent source of truth.
- Durable Objects coordinate live sequencing and SSE fan-out, not long-term state ownership.
- Match mutations go through the per-match `MatchRoom` Durable Object, which then writes accepted facts to D1.
- Non-live read paths may query D1 directly when they do not need per-match sequencing or fan-out.
- Do not introduce Durable Object or D1 location hints until production behavior shows a real latency or locality problem.

## Package Boundaries

- `packages/core`
  - shared IDs, contracts, schemas, and generic envelopes only,
  - no runtime or persistence concerns,
  - no dependency on other internal packages.
- `packages/gameplay`
  - pure game and match-kernel logic,
  - game registry,
  - game command interpretation,
  - game-owned control and display projections,
  - depends on `core`, never on `competition`.
- `packages/competition`
  - storage-agnostic application use-cases and match policy,
  - match administration policy,
  - depends on `core` and `gameplay`.
- Runtime app
  - owns Cloudflare bindings and adapters,
  - calls competition services.

Dependency direction:

`core <- gameplay <- competition <- runtime-app`

## Game Integration Rules

- Game keys come from the central registry.
- Shared app code should consume game projections, not game internals.
- Keep one consistent game command path based on `game.command` with game-specific payloads.
- Match kernel owns generic lifecycle and sequencing.
- Game implementations own game semantics, control projection, and public display projection.

## Persistence Rules

- Keep stable cross-game fields relational.
- Keep game-specific or policy-specific variability in JSON payloads.
- Only normalize more data when a real query or reporting need appears.
- Event history remains the source of truth.
- Prefer additive history and explicit corrections over destructive mutation.

## Runtime Coordination

- The current production shape is `Worker route -> MatchRoom Durable Object -> D1` for match creation and command acceptance.
- The Durable Object is a per-match coordinator: it serializes accepted facts, maintains warm runtime cache, and broadcasts SSE updates.
- D1 owns durable match rows, fact history, and persisted snapshots.
- Direct Worker-to-D1 reads are acceptable for list, lookup, history, and hydration paths that do not need live coordination.
- Treat Cloudflare Worker, Durable Object, and D1 placement as independent until measured otherwise; observe production latency before adding location hints or regional constraints.

## Active Match UI

- Active match controls optimize for fast table-top scoring on an iPhone 16-class vertical screen.
- Use the dedicated `control` button size for live scoring commands instead of globally enlarging ordinary app buttons.
- Keep visible active-match text at 16px or larger unless it is screen-reader-only.
- Preserve centered neutral actions when centering carries meaning; avoid full-width neutral controls by default.
- Do not show command-tier labels such as Primary, Secondary, or Tertiary in the scoring surface.

## Validation And Schemas

- Standardize schema imports on `valibot`.
- Shared schemas originate in `packages/core`.
- Client-side validation is helpful, but server-side validation is mandatory.

## Guardrails

- Do not place domain rules directly in route files.
- Do not let app code infer behavior from hardcoded game keys.
- Do not keep generic helpers that secretly encode Pyramid assumptions as shared truth.
- Do not normalize game internals prematurely.
- Do not let competition or referee concerns leak into core game reducers unless they are true game semantics.

## Deferred By Design

- guest/session-based access control is a product milestone, not a reason to reshape the core engine right now,
- managed scoreboards come after access and permissions,
- additional storage normalization should follow real lookup/stat/reporting screens.
