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
