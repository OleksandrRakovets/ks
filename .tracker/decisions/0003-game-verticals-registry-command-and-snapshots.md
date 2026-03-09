# 0003 - Game Verticals via Registry + `game.command` + Snapshot Pruning

## Status

Proposed

## Context

Current game keys and game-specific behavior are hardcoded across domain, worker, and UI layers.

We need an architecture that can support:

- simple pyramid-style scoring,
- richer shot semantics (snooker/Strila),
- per-game input UIs,
- one consistent command path without per-layer conditionals.

## Decision

1. Introduce a game registry in `packages/games/registry.ts` as the single source of truth for game keys and metadata.
2. Use one game write event model: `game.command`, with `commandType: 'shot.recorded'` as the primary command for all games.
3. Keep match kernel responsibilities generic (lifecycle, sequencing, frame boundaries, status, lock rules).
4. Move game semantics into pluggable game definitions in `packages/games`.
5. UI picks input controls by `registry[gameKey].meta.inputMode`.

## Match vs Game boundary

- Match kernel owns:
  - match lifecycle (`match.created`, `match.ended`),
  - frame lifecycle (`frame.started`, `frame.awarded`, `frame.reopened`),
  - event sequencing and lock constraints,
  - shared participants/targets envelope.
- Game implementation owns:
  - scoring and foul interpretation,
  - table/ball state,
  - legality of a shot payload,
  - derived projections for score/turn/UI hints.

## Event model

- Keep kernel events.
- Add event:
  - `game.command` with payload:
    - `gameKey`
    - `commandType` (`shot.recorded` now; extend later)
    - `command` (game-specific JSON payload)
- Game reducer returns `effects` consumed by match kernel (e.g. `awardFrame`, `switchTurn`, `endMatch`).

## Persistence model

### Generic columns (query-friendly)

- `matches`: `match_id`, `game_key`, `status`, `created_at`, `ended_at`, `lock_at`, `latest_seq`
- `match_participants`: shared participant/seat data
- `match_events`: append-only event envelope + `payload_json`

### JSON fields (game-specific)

- `matches.config_json` for per-game configuration
- snapshots `state_json` for per-game runtime state
- `match_events.payload_json` for command payload details

## Snapshots

- Source of truth remains `match_events`.
- Snapshot write policy:
  - every 10 events,
  - and always on `frame.awarded`,
  - and always on `match.ended`.

### Pruning policy

1. For active matches: keep only the latest snapshot row per match (replace previous snapshot).
2. After `match.ended` and post-lock window, delete snapshots for that match.
3. Historical protocol/reconstruction is derived from `match_events`.

This keeps storage small while preserving correctness.

## Undo policy

- Use explicit undo event (`event.undone { targetEventId }`) for audit clarity.
- Game reducers define whether a given command is undoable.

## Steps to migrate current code

1. Registry and keys
   - Add `packages/games/src/registry.ts` with game list/meta.
   - Replace hardcoded unions/options in:
     - `packages/domain/src/match.ts`
     - `services/worker/src/index.ts`
     - `clients/rr7/src/api/ks.ts`
     - `clients/rr7/src/routes/AdminCreateMatch.tsx`

2. Command event path
   - Add `game.command` schema in `packages/domain/src/events.ts`.
   - Keep existing events readable during transition.

3. Pluggable game reducers
   - Add `GameDefinition` interface in `packages/games`.
   - Move special-case logic from `packages/games/src/apply.ts` into per-game definition modules.
   - Keep kernel reducer focused on shared lifecycle rules.

4. Worker integration
   - In `services/worker/src/do/MatchRoom.ts`, route `game.command` to selected game definition.
   - Persist effects as kernel events where needed.

5. UI verticals
   - Add per-game input components in `clients/rr7/src/routes/ControlMatch.tsx` (or extracted components), selected by registry metadata.
   - Pyramid input maps to `shot.recorded`; snooker/Strila can use richer payloads without changing transport shape.

6. Snapshot storage updates
   - Update D1 schema/migrations for snapshot table shape if needed.
   - Implement latest-only active snapshot replacement + ended-match snapshot cleanup.

## Consequences

- Better extensibility for new games and complex shot semantics.
- Cleaner separation of kernel vs game-specific logic.
- Lower risk of cross-layer hardcoded drift.
- Slightly higher upfront modeling effort, repaid by easier future game additions.

## Amendments (2026-03-09)

### Amendment A - Layer split for reuse and cycle safety

To support non-browser flows and avoid package cycles, refine the architecture into three reusable layers:

1. `packages/core`
   - Contracts and shared primitives only.
   - IDs, shared schema/value-object contracts, generic envelopes.
   - No runtime/storage concerns.
   - No dependency on other internal packages.

2. `packages/gameplay`
   - Pure match kernel + game registry + pluggable game definitions.
   - Deterministic JS in/out logic.
   - Owns command interpretation (`game.command`, `shot.recorded`) and projections.
   - Depends on `packages/core`.
   - Must not depend on `packages/domain`.

3. `packages/domain`
   - Business use-cases/services across entities (matches, players, scoreboards).
   - Orchestrates gameplay + persistence ports.
   - Runtime-agnostic service layer (no hardcoded route actions).
   - Depends on `packages/core` and `packages/gameplay`.

Runtime (RR7 framework worker) owns Cloudflare bindings and passes connections/adapters into domain services, per Decision 0001.

### Amendment B - Allowed dependency direction

Required dependency DAG:

`core <- gameplay <- domain <- runtime-app`

Guardrails:

- Forbid `gameplay -> domain` imports.
- Allow `domain -> gameplay` imports.
- Keep route modules thin orchestration layers.

### Amendment C - Flow mapping

Case 1 (HTTP + D1/DO path):

- RR7 action/loader (with bindings) -> domain service -> gameplay kernel/game handler -> persistence/events/snapshot updates.

Case 2 (simulation script):

- Script -> gameplay kernel/game handler (optionally domain with in-memory adapters).

Case 3 (game-only tools):

- Tool/script -> gameplay game handler directly.

### Amendment D - Schema sharing standard (`zod/v4`)

For shared validation and cross-package schema composition:

- Standardize all schema imports on `zod/v4`.
- `packages/core` is the source of shared schemas/contracts exported for reuse.
- Any package that defines or composes schemas must declare a direct `zod` dependency.
- Prefer passing exported schemas from `core` across package boundaries rather than duplicating equivalent schemas.
- Keep all internal packages on one Zod major/minor line to avoid schema interop drift.

Implementation todo (ordered):

1. Enforce one resolved Zod version across workspaces (root-level pin/override).
2. Enforce one schema import path (`zod/v4`) via tooling/checks.
3. Ensure packages that define or compose schemas declare a direct `zod` dependency so they can safely compose schemas exported from `packages/core`.
4. After 1-3 are implemented, document this schema-sharing rule in `AGENTS.md` for future agents.
