# Typed Game Routes Specification

## Status and Scope

Planned two-slice refactor. The work replaces the generic control projection path with finite, game-keyed contracts and then gives every registered game explicit control and protocol routes.

The slices are intentionally collocated:

1. change gameplay, competition, MatchRoom, and application interfaces without adapting Play;
2. replace the Play routes and restore the full repository gate.

The repository has not shipped. Do not preserve the current `/sparring/matches/:matchId/` URLs, add redirects, retain compatibility overloads, or keep the generic renderer path beside the new routes.

The canonical route key is the exact `RegisteredGameKey`, including `strila-v2`.

This specification is separate from `.tracker/schema-type-consolidation-spec.md`. Implement that storage/schema cleanup independently; do not mix it into these slices unless a directly overlapping edit is required.

## Target Interface

### Finite game contracts

Gameplay must advertise the real state and projection outputs for each registered key without making callers consume one named all-game projection union.

Use a keyed contract map or an equivalent interface:

```ts
export type GameContracts = {
  'strila-v2': {
    state: StrilaFrameState
    control: StrilaControlView
    scoreboard: StrilaScoreboardView
    summary: StrilaSummaryView
  }
  'free-pyramid': {
    state: PyramidFrameState
    control: FreePyramidControlView
    scoreboard: FreePyramidScoreboardView
    summary: FreePyramidSummaryView
  }
  'free-pyramid-long': {
    state: LongFreePyramidFrameState
    control: LongFreePyramidControlView
    scoreboard: LongFreePyramidScoreboardView
    summary: LongFreePyramidSummaryView
  }
  'combined-pyramid': {
    state: PyramidFrameState
    control: CombinedPyramidControlView
    scoreboard: CombinedPyramidScoreboardView
    summary: CombinedPyramidSummaryView
  }
  'combined-pyramid-old': {
    state: PyramidFrameState
    control: CombinedPyramidOldControlView
    scoreboard: CombinedPyramidOldScoreboardView
    summary: CombinedPyramidOldSummaryView
  }
}

export type RegisteredGameKey = keyof GameContracts
export type GameStateFor<K extends RegisteredGameKey> = GameContracts[K]['state']
export type ControlProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['control']
export type ScoreboardProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['scoreboard']
export type SummaryProjectionFor<K extends RegisteredGameKey> = GameContracts[K]['summary']
```

The exact names may change, but these relationships must be available from gameplay's public contracts. A dynamic internal operation may evaluate `ControlProjectionFor<RegisteredGameKey>` to a union; do not export a second hand-maintained union or require static game routes to consume it.

Every concrete projection schema must include its literal game key. The three pyramid variants may share implementation helpers, state types, details types, and render code, but their public projection values must retain their exact registered key.

### Typed gameplay definition

Each registry entry must carry the runtime evidence needed to preserve the keyed relationship:

```ts
export interface GameplayDefinition<K extends RegisteredGameKey> {
  readonly key: K
  createInitialState(args: GameCreateStateArgs): GameStateFor<K>
  applyCommand(args: { state: GameStateFor<K>; command: ControlCommand }): GameCommandResult<GameStateFor<K>>
  deriveControl(state: GameStateFor<K>): ControlProjectionFor<K>
  deriveScoreboard(state: GameStateFor<K>): ScoreboardProjectionFor<K>
  deriveSummary(state: GameStateFor<K>): SummaryProjectionFor<K>
}
```

This is illustrative, not a requirement to use a class. Prefer separate projection methods over `deriveProjection(...): unknown`; callers know which projection they request, and the methods have different real output types.

The registry must remain exhaustive over `RegisteredGameKey`. Keep any unavoidable correlated-index implementation detail private to gameplay. Do not spread assertions through MatchRoom, application, or Play.

## Slice 1: Typed Backend Interfaces

### Scope

Change only:

- `packages/core` where an immediately consumed generic refinement or control type belongs there;
- `packages/gameplay`;
- `packages/competition`;
- `packages/application`;
- `do/match-room`;
- focused tests for those workspaces.

Do not edit `apps/play`, `apps/play/web/routes.ts`, generated React Router files, or global lint/typecheck configuration in this slice.

It is acceptable and expected for Play to be temporarily incompatible with the new application interface. Do not add compatibility fields, deprecated overloads, broad `unknown` returns, or new suppressions merely to keep the old route compiling. Commit the backend slice as one collocated interface change.

### Gameplay

Implement the finite game contract and make the gameplay registry the source of the relationship between game key, state, and projection outputs.

Required changes:

- export schema-inferred control, scoreboard, and summary view types that gain consumers in this slice;
- give every concrete projection its exact literal `gameKey`;
- replace `GameplayRuntime` methods that return `unknown` with keyed real outputs;
- replace the single unknown-returning projection method with typed projection methods or an equally precise keyed interface;
- remove redundant parsing of an already typed `GameProjectionKey`;
- keep parsing only where a representation is genuinely restored or received;
- do not parse locally constructed projections again after a typed projection constructor has produced them.

State held by dynamic MatchRoom code must retain its key correlation. A private tagged carrier is acceptable:

```ts
type ActiveGameState<K extends RegisteredGameKey> = {
  gameKey: K
  state: GameStateFor<K>
}
```

Dynamic code may use the mapped finite union of these carriers internally. Do not represent a state without the game key needed to interpret it, and do not widen a state produced by gameplay back to `unknown`.

Replace projection command helpers that accept `Record<string, unknown>` with game-owned typed command inputs or constructors. The core control envelope may remain transport-oriented, but gameplay code constructing a known command must retain its command vocabulary until it enters that envelope.

### Competition

Competition must stop inspecting an unknown game projection. Give `deriveSparringControlSections` a small typed contribution containing only the facts competition uses:

```ts
type GameControlContribution = {
  phase: string
  commandSections: ControlCommandSections
}
```

All concrete control detail outputs must satisfy this contribution by construction. MatchRoom passes the contribution directly. Delete `extractGamePhase`, `extractGameControlSections`, runtime `typeof` probing, and reparsing of command sections.

Preserve the game key through match results where the caller has established a registered literal key. A refinement such as `MatchSnapshotFor<K>` is acceptable and should be exported only with immediate consumers:

```ts
type MatchSnapshotFor<K extends GameKey> = Omit<MatchSnapshot, 'gameKey'> & {
  gameKey: K
}
```

Do not genericize every fact or aggregate merely for symmetry. Push the key parameter into competition state only where doing so removes a real widening in the MatchRoom/application flow.

### MatchRoom

MatchRoom remains the authoritative active-match runtime and the dynamic game-selection seam.

Required changes:

- derive concrete typed projections through the keyed gameplay definition;
- stop parsing a projection immediately after gameplay constructs it;
- remove the weaker local summary projection schema;
- retain exact game-key evidence alongside current frame state;
- return real registered projection output through its private RPC result rather than `unknown` or a shallow envelope with unknown details;
- represent absence of a current frame projection explicitly between frames.

The RPC implementation is dynamic and may internally return the mapped output for all registered keys. That dynamic type remains private to MatchRoom and the application adapter. Static route consumers must receive `ControlProjectionFor<K>`, not the dynamic type.

### Application

Replace the generic active control result with a keyed use case:

```ts
readMatchControl<K extends RegisteredGameKey>(
  matchId: MatchId,
  locale: SupportedLocale,
  expectedGameKey: K,
): Promise<ReadMatchControlResult<K>>
```

The result must distinguish lifecycle states so a projection is available exactly when valid:

```ts
type ReadMatchControlResult<K extends RegisteredGameKey> =
  | {
      ok: true
      state: 'frame-active'
      snapshot: MatchSnapshotFor<K>
      controlProjection: ControlProjectionFor<K>
      controlSections: ControlCommandSections
      participants: HydratedMatchParticipants
    }
  | {
      ok: true
      state: 'between-frames'
      snapshot: MatchSnapshotFor<K>
      controlSections: ControlCommandSections
      participants: HydratedMatchParticipants
    }
  | ReadMatchFailure
```

The application must compare the stored/room game key with `expectedGameKey` before constructing the generic success value. A mismatch returns the same not-found result as an unknown match; do not reveal that a match exists under another game URL.

Use the keyed gameplay schema/definition as the runtime witness when converting a dynamic MatchRoom result into `ControlProjectionFor<K>`. Keep any TypeScript correlated-index workaround private and immediately adjacent to the successful key/schema proof.

Add an equivalent keyed protocol read operation or parameterize the existing protocol operation with `expectedGameKey`. Its result must return `MatchSnapshotFor<K>` so the game-specific protocol route can compose its own top bar without narrowing.

Do not pass gameplay definitions, schemas, Drizzle records, or MatchRoom stubs through the public `Application` interface. The route supplies the literal expected key; application owns orchestration and runtime verification.

### Slice 1 tests

Add or update focused tests proving:

- each registry key returns its exact control, scoreboard, and summary game key;
- each runtime projection method has the schema-inferred output expected for its key;
- a runtime cannot be registered under a key with incompatible state or projection outputs;
- competition merges game and match controls without unknown introspection;
- MatchRoom returns typed control and summary projections and represents the between-frame state without a fabricated projection;
- application returns a game-keyed control result for every registered key;
- application returns not found when `expectedGameKey` does not match the catalog/snapshot key;
- keyed protocol reads preserve the expected key for active and archived matches.

### Slice 1 verification

Do not run `bun run check`, root `bun run typecheck`, root `bun run lint`, or the Play typecheck in this slice. They include the intentionally stale router.

Run targeted verification without changing ignore configuration:

```sh
bun run --cwd packages/core typecheck
bun run --cwd packages/gameplay typecheck
bun run --cwd packages/competition typecheck
bun run --cwd packages/application typecheck
bun run --cwd do/match-room typecheck
bunx oxlint packages/core packages/gameplay packages/competition packages/application do/match-room
bun run check:boundaries
bun test packages/core packages/gameplay packages/competition packages/application do/match-room/src
bun run --cwd do/match-room build
```

If Bun does not accept multiple test directories in that form, run the same directories as separate `bun test <path>` commands. Do not broaden lint ignores or add temporary suppressions.

All `REVIEW_POST_REFACTOR` suppressions outside `apps/play` must be gone at the end of this slice. Record the expected Play compile errors in the handoff or commit message; do not fix them until Slice 2.

## Slice 2: Explicit Game Routes

### Route tree

Delete the generic control route and register ten static leaves, using exact game keys:

```text
/match/strila-v2/:matchId/control/
/match/strila-v2/:matchId/protocol/
/match/free-pyramid/:matchId/control/
/match/free-pyramid/:matchId/protocol/
/match/free-pyramid-long/:matchId/control/
/match/free-pyramid-long/:matchId/protocol/
/match/combined-pyramid/:matchId/control/
/match/combined-pyramid/:matchId/protocol/
/match/combined-pyramid-old/:matchId/control/
/match/combined-pyramid-old/:matchId/protocol/
```

Do not retain `/sparring/matches/:matchId/`, add redirect loaders, or add dynamic `:gameKey` routes. Update every internal match link to construct the new URL from a `RegisteredGameKey` and `MatchId`.

The router rejects unknown game slugs. Each loader must additionally pass its literal expected key to application; a valid slug paired with another game's match ID receives not found.

### Explicit route composition

Create one control and one protocol route module per game. Each control route imports its concrete renderer directly and receives its concrete projection type from `readMatchControl()`:

```ts
export function loader(args: Route.LoaderArgs) {
  return loadMatchControl(args, 'strila-v2')
}

export default function StrilaControlRoute() {
  const data = useLoaderData<typeof loader>()
  // Render Strila composition directly.
}
```

Do not add a renderer registry, `resolveControlRenderer`, a projection union switch, or a configurable page component that recreates the old generic route indirectly. The concrete renderer must not parse its projection.

Explicit JSX duplication is acceptable. Preserve current behavior and layout in each route first. Optimization of common layout, top bars, command rows, tabs, and visual composition is deferred until the five routes reveal stable common structure.

Small behavior-focused reuse is allowed:

- FormData parsing and the shared control action;
- match-live subscription/revalidation hook;
- URL construction from a registered key and match ID;
- locale/request helpers;
- focused leaf UI elements that already have multiple real consumers.

Do not extract a large generic route shell in this slice.

### Control actions and commands

All five control routes use the same command path. Parse the complete submitted `ControlCommand` once at the HTTP boundary. Remove `actionType`, unused submitted `gameKey`, `let command: unknown`, and the reconstruct-then-reparse branches.

Game-specific renderers may own game-specific command labels and payload adaptation. Match-level command presentation may remain shared. Remove generic `control-copy` payload assertions and runtime `typeof` inspection; do not replace them with another loose object parser inside render code.

### Protocol routes

Each protocol route calls the keyed application protocol operation with its literal game key and renders that game's top-level composition directly. Shared protocol rows may remain common. The game-specific route may initially reproduce the same markup; the static route and typed snapshot are the extension point for later top-bar and protocol presentation work.

### Projection absence

Do not manufacture an empty game projection. In the `between-frames` result branch, render only valid match-level controls. In the `frame-active` branch, pass the guaranteed concrete projection directly to the game renderer.

### Slice 2 tests

Add or update route tests proving:

- all ten static routes load for their matching game;
- unknown game slugs do not match;
- a valid game route with another game's match ID returns not found;
- active-frame routes receive and render their exact projection without renderer parsing;
- between-frame routes render match-level controls without a game projection;
- finished control requests follow the chosen terminal behavior directly, without relying on a legacy redirect;
- each protocol route renders the matching typed snapshot and shared rows;
- all match creation, match list, control, and protocol links use the new canonical URLs;
- command submission still uses the single `game.command`/match-command application path;
- live revalidation works on each control route.

### Slice 2 lint and verification

Remove every remaining `REVIEW_POST_REFACTOR` comment and suppression. The lint issues previously hidden by those comments must be fixed by typed interfaces and boundary parsing, not replaced with different suppressions.

Repository search must find none:

```sh
rg "REVIEW_POST_REFACTOR" .
```

Delete renderer-level Valibot parsing that existed only to recover game-specific projection types. Browser storage, SSE/WebSocket messages, FormData, and other genuine representation seams remain validated.

Run the complete gates:

```sh
bun run check
bun run build
```

## Completion Criteria

- Gameplay publicly relates every registered game key to its real state and projection outputs.
- Gameplay runtime operations do not return `unknown` projections or widen constructed state to `unknown`.
- Competition consumes a typed control contribution without runtime shape inspection.
- Application exposes keyed control and protocol reads whose successful values retain the literal game key.
- MatchRoom and application keep dynamic all-game types private to their implementations.
- Play has five explicit control routes and five explicit protocol routes using exact registered keys.
- Renderers receive guaranteed concrete projection types and perform no projection parsing.
- No generic renderer registry, dynamic game route, legacy URL, or compatibility redirect remains.
- Between-frame control is represented without a fabricated game projection.
- Explicit route rendering remains duplicated until a later UI-layout optimization pass.
- No `REVIEW_POST_REFACTOR` suppression remains.
- `bun run check` and `bun run build` pass after Slice 2.
