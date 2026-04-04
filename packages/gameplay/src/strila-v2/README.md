# Strila V2 Notes

This folder contains the Strila v2 gameplay runtime inside `packages/gameplay`.

## Current shape

1. The public interaction model is command-based.
2. The runtime owns per-frame state, reducer logic, projections, and protocol entry projection.
3. Tests and simulations are the main design tool.
4. The package stays framework-free and browser-free.

## Runtime contract

The Strila runtime currently implements the shared gameplay runtime contract:

1. `createInitialState()` returns a Strila frame state.
2. `applyCommand(...)` parses the incoming command envelope, reduces the next state, and returns `{ state, protocolEntries }`.
3. `deriveProjection(...)` returns one of the shared projection envelopes: `control`, `scoreboard`, or `summary`.

The canonical package-level flow is:

1. create initial game state,
2. derive the `control` projection,
3. render `availableCommands`,
4. submit one canonical command,
5. persist or replay the resulting `game.command` event stream.

There is no separate action-wrapper API anymore.

## Current phase set

1. `not-started`
2. `open-play`
3. `foul-response`
4. `opponent-foul-ball-in-hand`
5. `respotted-black-opening`
6. `respotted-black-play`
7. `winner-determined`
8. `frame-over`

## Current modeling decisions

- No explicit marker/secretary turn ledger in the core model.
- `actor` means only the seat expected to log the next command.
- Shot origins like baulk / second-baulk are not modeled in state.
- Snooker remains deferred; if needed later it should likely be a shot constraint, not a top-level phase.
- Winner determination and frame award are separate concepts.
- Respotted black is represented on the virtual table via `coloredBallsOnTable`.
- Some rulebook outcomes are handled automatically by the reducer as an electronic referee.
- The reducer still throws on invalid commands or impossible state transitions in dev.
- Post-award correction is a later referee/admin concern, not part of the normal control flow.

## Projections

Strila now uses the shared gameplay projection envelope shape.

- `control` includes top-level `gameKey`, `projection`, `score`, `availableCommands`, and Strila-specific `details`.
- `scoreboard` includes top-level `gameKey`, `projection`, `score`, and Strila-specific `details`.
- `summary` currently reuses the scoreboard derivation path in `runtime.ts`, even though a Strila summary schema also exists.

Control projections expose canonical command presets directly via `availableCommands`. Those command presets already include payloads such as actor and foul-response choice, so UI can submit them without a Strila-specific adapter layer.

## Protocol entries

One player command can already produce multiple protocol entries.

Examples currently projected in `protocol.ts`:

- player command entry,
- automatic foul entry,
- winner determined entry,
- respotted black declared entry.

That means the earlier note about maybe needing extra semantic consequences is now partly implemented at the runtime boundary via `protocolEntries`, while the reducer itself still returns only next state.

## Key files

- `runtime.ts`: shared gameplay runtime implementation for Strila.
- `reducer.ts`: core state machine.
- `definitions.ts`: schemas and local types.
- `protocol.ts`: derives player/system protocol entries from previous state, command, and next state.
- `projections/control.ts`: UI-facing command presets and control details.
- `projections/scoreboard.ts`: scoreboard projection.
- `simulations/*.test.ts`: scenario coverage through the public gameplay API.

## Reserved for later

- richer competition/referee workflows,
- marker/secretary mode,
- stats and visit-level tracking,
- stricter typing for generic projection details,
- deciding whether `summary` should diverge from `scoreboard` in Strila.
