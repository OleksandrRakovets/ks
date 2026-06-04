# Protocol Page Runtime Simplification

Date: 2026-05-26

Context: `clients/rr7/app/routes/sparring-match/route-protocol.tsx` was the last public route-shaped module importing `@ks/gameplay/server`. It also knew `MatchSnapshot`, raw `StoredFact`, game command payload shapes, and how to replay the current frame. This conflicted with the current architecture note: route modules stay thin, shared app code should consume game projections/read models rather than game internals, and fact history should remain operational rather than becoming the durable protocol archive.

## Candidate 1: Store Accepted Protocol Effects In Facts

**Files**: `packages/core/src/events.ts`, `packages/gameplay/src/constants.ts`, `packages/gameplay/src/gameplay.ts`, `packages/gameplay/src/pyramid/runtime.ts`, `packages/gameplay/src/strila-v2/runtime.ts`, `clients/rr7/workers/do/MatchRoom.ts`, `clients/rr7/app/routes/sparring-match/route-protocol.tsx`, `clients/rr7/app/routes/sparring-match/protocol-rows.ts`.

**Problem**: The protocol page replayed `game.command` facts through the game runtime just to recover serializable facts that already existed at command acceptance time: score after the command and any protocol entries. This made a public route-shaped module depend on a server-only runtime seam and forced maintainers to understand game internals while editing page display.

**Solution**: When `MatchRoom` accepts a game command, make the game runtime return printable, locale-neutral protocol effects. The protocol page consumes those accepted effects rather than booting the game runtime. The game runtime remains used at the command-acceptance seam, where game semantics already belong.

**Benefits**: Locality improves because command semantics, automatic Strila protocol entries, and score-after calculation stay in the game runtime and `MatchRoom` acceptance flow. Leverage improves because history readers get a small protocol interface instead of reconstructing state. Tests can assert runtime protocol effects; route/read-model tests only need serializable rows.

**Deletion test**: If the route-local replay code is deleted, replay complexity should not have to reappear in the page or another caller. Accepted protocol effects remove complexity rather than moving it.

**Recommendation strength**: Strong.

### Candidate 1 Status

- Done: `protocolEntries` currently live on accepted `game.command` fact payloads as the first working slice.
- Delayed: `protocolEntries` should not remain only inside `facts.payload_json` long term, because completed-match facts are expected to be pruned.
- Done: There is no compatibility fallback or backfill; local D1 can be reset before public use.
- Done: Protocol entries are locale-neutral structured facts. Display strings are derived later by a read module with locale and participant names.
- Done: Protocol entries use a small `@ks/core` envelope: `source`, `entryType`, optional `seat`, optional `scoreAfter`, and required game-owned `body`.
- Done: `source` starts as `player | system`; `entryType` starts as `player-command | system-note | correction`.
- Done: Every accepted `game.command` fact currently contains a non-empty `protocolEntries` array.
- Delayed: Once the durable archive table exists, persisted `game.command` facts may no longer need to embed `protocolEntries`; the runtime should still return protocol effects for `MatchRoom` to materialize.
- Done: Every game runtime returns non-empty `protocolEntries` from `applyGameCommand`.
- Done: `scoreAfter` is optional and means the specific protocol entry changed the visible frame score. Missing `scoreAfter` means the row should not print a score.
- Revised: Protocol entries are the durable history interface, but the durable storage target should be a completed-match protocol archive, not the prunable `events` table.
- Done: Raw command payloads are operational data and may later be pruned or ignored after match completion.
- Reserved: Undo/correction history is additive. The initial vocabulary reserves `correction`, but this slice does not implement undo behaviour.
- Done: `route-protocol.tsx` no longer imports `@ks/gameplay/server` or replays game state.
- Done: Protocol row derivation lives in a pure sidecar module: `clients/rr7/app/routes/sparring-match/protocol-rows.ts`.
- Done: Match lifecycle facts are included in protocol rows: `frame.started`, `frame.completed`, and `match.ended`.
- Done: The redundant `frame.completed` row immediately after `game.command: frame.award` is hidden.
- Done: Active-match newest-first ordering is applied in the loader, not during render.
- Done: SSE remains server-authoritative revalidation only; no local protocol-row append cache.

## Candidate 2: Add A Protocol Read Module Behind The Route

**Files**: `clients/rr7/app/routes/sparring-match/route-protocol.tsx`, `clients/rr7/app/server/match-room.ts`, possibly a new server-side module under `clients/rr7/app/server/` or a storage-agnostic module in `packages/competition/src/`.

**Problem**: The route-shaped module still exposes too much interface to itself: raw snapshot data, participant hydration, score-box fallback, protocol ordering, active/finished display policy, and SSE status. Even after route-local replay was removed, the route still has poor locality because display policy is mixed with route rendering.

**Solution**: Move protocol-page derivation behind a narrow read module that returns a page-specific read model: header data, score-box data, protocol rows, and navigation state. The route consumes that read model and renders it. The read module can read active protocol rows from events and completed protocol rows from an archive table without changing the route.

**Benefits**: Locality improves because protocol-page data shaping has one home. Leverage improves because the route interface becomes a single read model rather than snapshots plus participants plus control projection plus stored facts. Tests can target the read module interface with stored facts/archive rows and expected page rows, without rendering the route or opening SSE.

**Deletion test**: Deleting this module would force the route to recover raw event loading, archive/event source selection, row derivation, score fallback, and display ordering. That means the module would be deep, not a pass-through.

**Recommendation strength**: Strong.

## Candidate 4: Stop Returning Raw Snapshots To Page Routes

**Files**: `clients/rr7/app/server/match-room.ts`, `clients/rr7/app/routes/sparring-match/route-control.tsx`, `clients/rr7/app/routes/sparring-match/route-protocol.tsx`, `clients/rr7/app/routes/public-scoreboard.tsx`, `clients/rr7/workers/do/MatchRoom.ts`, `clients/rr7/migrations/0001_init.sql`.

**Problem**: Page routes currently know the `MatchSnapshot` shape and select frame score from a mix of `controlProjection`, active frame, and completed frame fields. That makes the route interface nearly as complex as the implementation and spreads snapshot knowledge across public display modules. Separately, completed-match protocol history should survive pruning of the operational `events` table.

**Solution**: Introduce page-specific read models for control, protocol, and public scoreboard routes. `MatchSnapshot` remains a lower-level domain fact/projection used behind the server seam, but pages receive exactly the fields they render. For protocol history, materialize a completed-match archive as one JSON row when the match is complete or locked.

**Protocol archive schema**:

```sql
CREATE TABLE IF NOT EXISTS match_protocol_archives (
  match_id TEXT PRIMARY KEY,
  source_latest_seq INTEGER NOT NULL,
  protocol_version INTEGER NOT NULL,
  rows_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

**Archive row shape**: `rows_json` should store a flattened, locale-neutral array of protocol row facts, not final rendered strings. Each row should include ordering, source timing, optional frame/game context, source/entry metadata, optional seat, optional score-after, and game-owned `body`.

Example:

```json
[
  {
    "rowNo": 1,
    "receivedAt": 1779750000000,
    "frameIndex": 1,
    "source": "player",
    "entryType": "player-command",
    "seat": "A",
    "scoreAfter": { "A": 3, "B": 0 },
    "body": { "commandType": "pot.record", "points": 3 }
  }
]
```

**Read policy**: Active protocol pages may derive rows from `events`. Finished protocol pages should prefer `match_protocol_archives`; once an archive exists, a daily cron can prune `events` for completed/locked matches without deleting printable protocol history.

**Benefits**: Locality improves because snapshot interpretation is concentrated near the read adapter. Leverage improves because future snapshot or storage changes do not require every page to relearn frame status rules. Completed protocol reads become a single archive-row read instead of scanning fact history. Tests can exercise read-model derivation without route rendering.

**Deletion test**: If page read models are deleted, snapshot interpretation and archive/event source selection immediately reappear in each route. That suggests the read models would be deep rather than shallow.

**Recommendation strength**: Strong for protocol route; worth exploring for control and public scoreboard routes.

## Current Recommendation

Keep Candidate 1 as the runtime protocol-effect interface, but stop treating prunable events as the durable protocol store. Implement Candidate 2 for the protocol page next, with Candidate 4's archive table as the completed-match storage path. The route should ask for a protocol page read model; the read module should choose `events` for active matches and `match_protocol_archives` for completed matches.

## Tomorrow Implementation Plan

### Locked Scope

- Start with the protocol page only.
- Public scoreboard is out of scope because it is not implemented yet.
- Control page read-model cleanup is a later slice after learning from protocol.
- `ScoreBox` props stay in `route-protocol.tsx` for this slice; the protocol read model owns protocol history only.
- Event pruning/cron is out of scope.
- `MatchRoom` tests/refactoring are out of scope except for the minimal hot-path archive write needed by this slice.

### Locked Decisions

- Completed-match archives are created immediately when `match.ended` is accepted.
- Archive creation starts in the `MatchRoom` hot path.
- Active protocol reads derive rows from `events`.
- Finished protocol reads require `match_protocol_archives`; no fallback to `events`.
- Keep `protocolEntries` embedded in active `game.command` events for now; pruning removes whole event rows, not payload fragments.
- Archive rows are strictly display-oriented and do not include `sourceFactSeq` or `sourceFactId`.
- Archive rows store structured data only; labels are derived at read time.
- Archive table includes `protocol_version = 1`; read code rejects unsupported versions.
- Modify `clients/rr7/migrations/0001_init.sql` directly because the schema is still early-stage/reset-friendly.
- Archive is triggered only by accepted `match.ended` facts.
- Do not add special recovery/error machinery for archive write failure yet; rely on normal request/write failure semantics.
- Pure protocol code should live under `clients/rr7/domain/protocol/reader.ts`, with tests and related files nearby.

### Implementation Steps

1. Add archive schema.
   Update `clients/rr7/migrations/0001_init.sql` with `match_protocol_archives` containing `match_id`, `source_latest_seq`, `protocol_version`, `rows_json`, and `created_at`.

2. Move protocol pure logic.
   Move `clients/rr7/app/routes/sparring-match/protocol-rows.ts` into `clients/rr7/domain/protocol/reader.ts`. Keep label derivation and event-derived active rows there. Add archive row types/schema with `protocol_version = 1`.

3. Add pure protocol functions.
   Add functions for deriving structured archive rows from `StoredFact[]`, rendering structured rows into display `ProtocolRow[]`, and deriving active display rows from `StoredFact[]` as a convenience wrapper.

4. Add pure tests.
   Add `clients/rr7/domain/protocol/reader.test.ts`. Cover lifecycle rows, `game.command.protocolEntries[]` expansion, hiding `frame.completed` immediately after `frame.award`, archive version rejection, and ordering policy if it lives in the reader.

5. Add archive persistence in `MatchRoom`.
   In the `match.ended` acceptance path, materialize protocol archive rows immediately. Use accepted/persisted facts in seq order, including the just-accepted `match.ended`. Insert one archive row into `match_protocol_archives`. Keep current `facts` writes unchanged.

6. Add protocol-history read function.
   Add a server-side read function for protocol history, likely under `clients/rr7/app/server/`. Active match: read `events`, derive active display rows. Finished match: read `match_protocol_archives`, reject missing or unsupported archive.

7. Update `route-protocol.tsx`.
   Replace `listStoredFacts + deriveProtocolRows` with the protocol-history read function. Keep existing snapshot, participants, game title, and `ScoreBox` wiring. Render receives rows already ordered. SSE remains revalidate-only and active-match-only.

8. Verify.
   Run focused protocol tests, `bun test`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run check:boundaries`, and `bun run check:zod`.

### Follow-Up Note

- `MatchRoom` currently has two separate fact-append paths: `appendAcceptedFacts()` for already-built init facts and `acceptCommands()` for command-derived facts. Archive creation for this slice should use the minimal `acceptCommands()` hot-path hook when `match.ended` is accepted. After archive implementation, revisit whether command-derived facts should flow through a shared append helper so lifecycle side effects such as archive creation, snapshot persistence, cache updates, and broadcast ordering have one obvious seam.
