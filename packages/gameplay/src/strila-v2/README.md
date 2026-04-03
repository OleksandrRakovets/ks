# Strila V2 Notes

This folder is the working area for the Strila v2 rules implementation.

## Current focus

1. Keep the model in plain TypeScript with Zod schemas.
2. Use Bun scenario tests as the main design tool.
3. Settle reducer behavior and rule edge cases before UI work.
4. Keep packages framework-free and browser-free.

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
- `actor` means only the seat expected to log the next action.
- Shot origins like baulk / second-baulk are not modeled in state.
- Snooker remains deferred; if needed later it should likely be a shot constraint, not a top-level phase.
- Winner determination and frame award are separate concepts.
- Respotted black is represented on the virtual table via `coloredBallsOnTable`.
- Some rulebook outcomes are handled automatically by the reducer as an electronic referee.
- Frame award is the final state boundary for normal undo/correction.
- If undo is supported, it should be protocol/replay-based and target the last player-entered command, not reset snapshots directly.
- Post-award correction is a later referee/admin concern, not part of the normal control flow.

## Important next-step note

One user command may eventually need to emit multiple semantic consequences.

Examples:

- automatic foul,
- winner determined,
- respotted black declared.

That suggests the reducer may later evolve from returning only `state` to returning something like `{ state, effects }`.

For now, do not change the reducer signature yet.
Keep working on simulations and rule coverage until the rule vocabulary settles further.

## Reserved for later

- richer competition/referee workflows,
- marker/secretary mode,
- stats and visit-level tracking,
- projection/guidance work after the rule model is more stable.
