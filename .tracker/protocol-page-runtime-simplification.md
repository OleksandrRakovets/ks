# Protocol Page Runtime Simplification

Date: 2026-05-26

Context: `clients/rr7/app/routes/sparring-match/route-protocol.tsx` is the last public route-shaped module importing `@ks/gameplay/server`. It also knows `MatchSnapshot`, raw `StoredEvent`, game command payload shapes, and how to replay the current frame. This conflicts with the current architecture note: route modules stay thin, shared app code should consume game projections rather than game internals, and event history remains the source of truth.

## Candidate 1: Store Accepted Protocol Effects In Facts

**Files**: `packages/core/src/events.ts`, `packages/gameplay/src/constants.ts`, `packages/gameplay/src/gameplay.ts`, `packages/gameplay/src/pyramid/runtime.ts`, `packages/gameplay/src/strila-v2/runtime.ts`, `clients/rr7/workers/do/MatchRoom.ts`, `clients/rr7/app/routes/sparring-match/route-protocol.tsx`.

**Problem**: The protocol page replays `game.command` facts through the game runtime just to recover serializable facts that already existed at command acceptance time: score after the command and any protocol entries. This makes a public route-shaped module depend on a server-only runtime seam and forces maintainers to understand game internals while editing page display.

**Solution**: When `MatchRoom` accepts a game command, persist the serializable effects returned by the game runtime with the accepted fact. At minimum this means a score-after value and game-owned protocol entries. The protocol page then prints accepted facts directly instead of booting the game runtime. The game runtime remains used at the command-acceptance seam, where game semantics already belong.

**Benefits**: Locality improves because command semantics, automatic Strila protocol entries, and score-after calculation stay in the game runtime and `MatchRoom` acceptance flow. Leverage improves because every reader of history gets a small fact interface instead of reconstructing state. Tests can assert accepted facts from `MatchRoom` or a fact-acceptance module, then route tests only need serializable rows.

**Deletion test**: If the route-local replay code is deleted today, replay complexity has to reappear in the page or another caller. If accepted protocol effects are stored in facts, deleting route-local replay removes complexity rather than moving it.

**Recommendation strength**: Strong.

## Candidate 2: Add A Protocol Read Module Behind The Route

**Files**: `clients/rr7/app/routes/sparring-match/route-protocol.tsx`, `clients/rr7/app/server/match-room.ts`, possibly a new server-side module under `clients/rr7/app/server/` or a storage-agnostic module in `packages/competition/src/`.

**Problem**: The route-shaped module currently exposes too much interface to itself: raw event ordering, seat-name labelling, snapshot status, active-frame score fallback, current-game replay, and list ordering. Even if facts become richer, the route still has poor locality because display policy is mixed with route rendering.

**Solution**: Move protocol-page derivation behind a narrow read module that returns a page-specific read model: header data, score-box data, protocol rows, and navigation state. The route consumes that read model and renders it. The first Adapter can read D1 events and `MatchRoom` snapshot data; if facts are enriched later, only the module implementation changes.

**Benefits**: Locality improves because protocol-page data shaping has one home. Leverage improves because the route interface becomes a single read model rather than snapshots plus participants plus control projection plus stored events. Tests can target the read module interface with stored facts and expected rows, without rendering the route or opening SSE.

**Deletion test**: Deleting this new module would force the route to recover raw event loading, row derivation, score fallback, and display ordering. That means the module would be deep, not a pass-through.

**Recommendation strength**: Strong.

## Candidate 3: Make Game Protocol Projection A Public Gameplay Interface

**Files**: `packages/gameplay/src/abstract-runtime.ts`, `packages/gameplay/src/constants.ts`, `packages/gameplay/src/pyramid/runtime.ts`, `packages/gameplay/src/strila-v2/protocol.ts`, `packages/gameplay/src/strila-v2/definitions.ts`, `packages/gameplay/contract/definitions.ts`, `packages/gameplay/contract/server.ts`.

**Problem**: Strila already has protocol entries, but they are only returned as an optional side effect of `applyCommand`. Pyramid has no equivalent public protocol shape, so the route guesses labels from raw command payloads. The interface is shallow: callers must know command internals to print history.

**Solution**: Treat protocol output as a game-owned display projection. Each game owns its protocol entry vocabulary and the label-worthy serializable facts it emits at command acceptance time. The route does not inspect `pot.record`, balls, points, or actor fields.

**Benefits**: Locality improves because game-specific wording inputs live with the game implementation. Leverage improves because adding a new game requires implementing its protocol projection once, not teaching app routes its command payloads. Tests can assert the gameplay protocol interface per game and a generic app renderer can consume it.

**Deletion test**: If this module is deleted, every history reader must learn each game's command vocabulary. That reintroduces game knowledge across callers, so the module would earn its keep.

**Recommendation strength**: Worth exploring.

## Candidate 4: Stop Returning Raw Snapshots To Page Routes

**Files**: `clients/rr7/app/server/match-room.ts`, `clients/rr7/app/routes/sparring-match/route-control.tsx`, `clients/rr7/app/routes/sparring-match/route-protocol.tsx`, `clients/rr7/app/routes/public-scoreboard.tsx`, `clients/rr7/workers/do/MatchRoom.ts`.

**Problem**: Page routes currently know the `MatchSnapshot` shape and select frame score from a mix of `controlProjection`, active frame, and completed frame fields. That makes the route interface nearly as complex as the implementation and spreads snapshot knowledge across public display modules.

**Solution**: Introduce page-specific read models for control, protocol, and public scoreboard routes. `MatchSnapshot` remains a lower-level domain fact/projection used behind the server seam, but pages receive exactly the fields they render.

**Benefits**: Locality improves because snapshot interpretation is concentrated near the read Adapter. Leverage improves because future snapshot changes do not require every page to relearn frame status rules. Tests can exercise read-model derivation without route rendering.

**Deletion test**: If page read models are deleted, snapshot interpretation immediately reappears in each route. That suggests the current snapshot exposure is shallow at page seams.

**Recommendation strength**: Worth exploring.

## Candidate 5: Split MatchRoom Acceptance From Persistence And SSE

**Files**: `clients/rr7/workers/do/MatchRoom.ts`, possibly `packages/competition/src/` if the extraction can stay storage-agnostic.

**Problem**: `MatchRoom` currently validates commands, translates commands into accepted facts, applies facts to room state, persists events, updates match rows, persists snapshots, and broadcasts SSE. The class has real depth as the live sequencing module, but its interface is hidden inside a large implementation, so fact-shape changes are harder to test than they should be.

**Solution**: Extract the command-to-facts and fact-application behaviour into a storage-agnostic module, leaving `MatchRoom` as the Cloudflare Adapter for sequencing, D1 writes, cache, and SSE. This is a real seam only if tests or another Adapter consume the extracted module; otherwise it risks being a hypothetical seam.

**Benefits**: Locality improves for command acceptance rules and fact effects. Leverage improves because accepted fact shape can be tested without Durable Object setup. Tests can cover the interface that matters: given room state and command, which accepted facts and serializable effects result.

**Deletion test**: If the extraction is deleted after tests target it, fact-generation complexity returns to `MatchRoom`. That is acceptable, but the module earns its keep only if the interface is smaller than the current class and tests use it directly.

**Recommendation strength**: Speculative.

## Top Recommendation

Start with Candidate 1, but design it together with Candidate 2. Candidate 1 removes the server-only runtime import from the protocol page by making accepted facts printable. Candidate 2 prevents the route from becoming a different shallow module that still knows snapshots, ordering, and display fallbacks. The smallest useful slice is: persist score-after and game protocol entries with future `game.command` facts, then route the protocol page through a narrow read module that consumes those serializable facts.

The key design decision to resolve next is whether these printable values are part of the accepted fact itself, or separate derived read-model data stored beside facts.

## Candidate 1 Locked Decisions

- `protocolEntries` live directly on accepted `game.command` fact payloads.
- There is no compatibility fallback or backfill; local D1 can be reset before public use.
- Protocol entries are locale-neutral structured facts. Display strings are derived later by a read module with locale and participant names.
- Protocol entries use a small `@ks/core` envelope: `source`, `entryType`, optional `seat`, optional `scoreAfter`, and required game-owned `body`.
- `source` starts as `player | system`; `entryType` starts as `player-command | system-note | correction`.
- Every accepted `game.command` fact must contain a non-empty `protocolEntries` array.
- Every game runtime must return non-empty `protocolEntries` from `applyGameCommand`.
- `scoreAfter` is optional and means the specific protocol entry changed the visible frame score. Missing `scoreAfter` means the row should not print a score.
- Protocol entries are designed as the durable history interface. Raw command payloads are operational data and may later be pruned or ignored after match completion.
- Undo/correction history is additive. The initial vocabulary reserves `correction`, but this slice does not implement undo behaviour.
