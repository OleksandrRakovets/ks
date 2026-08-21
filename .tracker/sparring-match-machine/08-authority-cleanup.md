# Slice 8: Remove Parallel Authority And Stabilize Exports

## Prerequisite

Slice 7 is accepted and production MatchRoom uses `SparringMatchSession` exclusively.

## Goal

Delete reducer/runtime-era authority, route completed archives through production replay/projection, stabilize production/tooling exports, and point the explorer at production machines.

## Competition Exports

`packages/competition/package.json` exports:

```json
{
  ".": "./src/index.ts",
  "./sparring-match-machine": "./src/sparring-match-machine.ts"
}
```

Root exposes creation contracts, sparring command/decision/rejection/session/state/projection contracts, replay/restore, and fact contracts required by consumers.

Tooling subpath exposes only `SparringMatchMachine`, input/snapshot inspection types, and phase helper.

Delete old subpath and names:

```text
@ks/competition/match-sparring-machine
matchSparringMachine
MatchSparringActor
MatchSparringSnapshot
getMatchPhase
```

## Gameplay Exports

`packages/gameplay/package.json` exports:

```json
{
  "./definitions": "./contract/definitions.ts",
  "./server": "./contract/server.ts",
  "./strila-machine": "./src/strila-v2/machine.ts",
  "./pyramid-machine": "./src/pyramid/machine.ts",
  "./long-free-pyramid-machine": "./src/long-free-pyramid/machine.ts"
}
```

`@ks/gameplay/server` exposes gameplay session/factory contracts. Tooling subpaths expose machine definition, input/snapshot inspection types, and phase helper. Concrete sessions and actor internals remain private.

The tooling symbols are `StrilaSparringFrameMachine`, `PyramidSparringFrameMachine`, and `LongFreePyramidSparringFrameMachine`, with correspondingly named snapshot and phase-inspection types/helpers.

## Delete Parallel APIs

Delete:

```text
packages/competition/src/match-state.ts
packages/competition/src/match-state.test.ts
```

Remove exports/usages:

```text
MatchState
MatchStateSchema
emptyMatchState
applyMatchFact
deriveMatchState
deriveMatchSnapshot
snapshotFromMatchState
GameplayDefinition
getGameplayRuntime
createInitialGameState
applyGameCommand
```

Delete remaining imperative runtime files, legacy adapters, and parity harnesses. Delete MatchRoom `RoomState`, `factsForCommand`, local apply/reconstruction, winner/breaker helpers, and domain snapshot assembly.

Competition has one room projection implementation. Controls no longer accept handcrafted broad reducer state.

## Completed Archive

Update completed archive creation to restore the production session from a non-empty ordered terminal journal and call `session.project(sourceLatestSeq)`.

Require:

- first fact is creation,
- final state is `match-over`,
- snapshot status is finished,
- match ID and source sequence agree,
- MatchRoom-supplied terminal projection equals replay projection.

Archive protocol rows from stored historical protocol entries. Replay verifies state and does not replace historical rows. Any mismatch aborts archival without partial writes.

## Explorer

Add direct `@ks/gameplay` workspace dependency and import only tooling subpaths. Remove source-relative package imports.

Match mode constructs the production sparring machine with complete config, begins between frames, uses production lifecycle events, and reaches terminal directly after a synthetic winning completion.

Frame modes inspect production machine definitions. Synthetic outcomes are labeled as topology inspection rather than MatchRoom integration.

## Architecture Notes

Update implemented architecture documentation to state:

- facts are durable authority,
- resident sessions are disposable behavioral authority,
- one match actor and at most one frame actor are resident,
- decision is non-mutating and committed facts advance actors,
- cold replay equals warm projection,
- completed archive uses the same replay path,
- raw XState snapshots are tooling contracts only.

## Tests

Competition tests replace reducer coverage with production replay/session tests for every game and malformed journal ordering.

Application/archive tests cover terminal success, non-terminal/empty/wrong-first journals, identity/sequence mismatch, replay failure atomicity, idempotent identical archive, and conflicting archive.

MatchRoom tests import no old state and prove snapshots/finalization come from session projection.

Add a boundary/search guard preventing production imports/usages of old subpaths, package source-relative gameplay imports, reducer names, and runtime factory APIs.

## Verification

```text
bun run check:boundaries
bun run --cwd apps/machine-explorer typecheck
bun run --cwd apps/machine-explorer build
bun run --cwd do/match-room build
bun run check
```

## Exit Gate

- Old reducer and imperative runtimes are deleted.
- MatchRoom and application contain no parallel state derivation.
- Completed archive verifies production replay/projection.
- Root exports contain no raw machine/actor APIs.
- Tooling imports explicit machine subpaths only.
- Explorer and architecture notes describe production behavior.
- Repository guards prevent reintroduction of obsolete authority.
