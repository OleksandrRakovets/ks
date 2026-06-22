# Long Free Pyramid Rack Tracking

Long Free Pyramid needs a dedicated gameplay model because its table-counting rules are materially different from the generic Pyramid variants.

## Decision

- `free-pyramid-long` should use its own gameplay runtime and XState machine.
- Some duplication with the generic Pyramid runtime is acceptable when it improves Long Free Pyramid UX clarity.
- Other Pyramid variants stay unchanged for the first slice.
- One app frame represents the whole Long Free Pyramid game. Physical racks are modeled inside that frame; rack rollover never emits `frame.completed` and never starts another app frame.
- This implementation pass should establish the verified runtime contract and projections. Long Free Pyramid-specific control rendering and hiding the single-frame match shape from the UI are follow-up work.

## Match Configuration

- Long Free Pyramid requires match-wide `gameConfiguration` at creation time.
- `gameConfiguration.rackRollover` is required for `free-pyramid-long` and must be `14` or `15`, for example `{ rackRollover: 14 }`.
- The preferred/default option is `14`; `15` remains selectable for the newer club rule.
- The configuration is immutable for the match.
- `gameConfiguration` must flow into initial game state creation so the runtime can validate and replay facts without relying on UI defaults.
- `frame.commence` remains only the break-off player command: `{ seat }`.
- For the current data model, the match still contains a single app frame. The UI should later default or force `matchTargetFrames` to `1` for Long Free Pyramid, but that is not required for the runtime/projection slice.

## State Model

- The initial Long Free Pyramid state starts with an open rack 1 at `0:0` before `frame.commence`.
- State preserves all rack entries for the frame, not only the current rack.
- Each rack stores per-seat rack score/removals, using the shared seat shape, for example `scoreBySeat: { A, B }`.
- Aggregate frame score is derived from the rack score totals.
- `ballsRemoved` and `ballsOnTable` are derived from current rack score totals.
- Use `ByRack` naming for rack-count concepts to avoid confusing the game title with the set of balls.
- Every new rack starts with 16 balls.
- State stores the configured `rackRollover` so replayed state remains self-contained.

## Rack Counting Rules

- Accepted `pot.record` commands remove `points` balls from the current rack and add `points` to the acting seat score.
- Accepted `foul.commit` commands award `+1` to the opponent and remove one ball from the current rack.
- A rack closes after any accepted pot or foul when current rack removed count is greater than or equal to `rackRollover`.
- A single command is not split across racks. If a command crosses the rollover threshold, all removed balls belong to the closing rack.
- Overrun racks such as 15 or 16 removed balls are valid under a 14-ball rollover rule.
- After rollover, append the next open rack immediately at `0:0` when play can continue.
- If a pot both reaches target and closes the rack, appending the next open rack is valid because the winner may continue scoring before awarding the frame.
- If a foul both reaches target for the opponent and closes the rack, do not append another rack because the frame enters `awaiting-award` and play should not continue.
- Pot controls expose `+1`, `+2`, `+3`, and `+4`, filtered by current `ballsOnTable`.
- Runtime validation should preserve the same invariant server-side; correction workflows are out of scope for this slice.

## Phases And Winner Flow

- Long Free Pyramid phases are `not-started`, `open-play`, `winner-determined`, `awaiting-award`, and `frame-over`.
- In `open-play`, controls expose filtered pot commands and foul commands for both seats.
- Target reached by a pot determines the acting seat as winner and enters `winner-determined`.
- Target reached by an opponent-plus-one foul determines the opponent as winner and enters `awaiting-award`.
- In `winner-determined`, controls expose and accept filtered pot commands, foul, and `frame.award` only for the determined winner.
- A winner foul after target still awards `+1` to the opponent, removes one rack ball, and transitions to `awaiting-award`.
- `awaiting-award` exposes and accepts only `frame.award` for the determined winner.
- `frame.award` is valid only for the determined winner and transitions to `frame-over`.
- The first determined winner remains the frame winner even if later continued scoring changes the visible score.

## Projections

- Long Free Pyramid should expose dedicated projection details instead of extending the shared Pyramid details shape.
- Projection details should include rack history, current rack, `ballsOnTable`, and control-pane `messages`.
- After rack rollover, the control pane should show a hint such as `Starting rack 2`.
- The rack-start message remains visible until the next accepted scoring command clears it.
- The first implementation pass only needs to provide and test these projections; a dedicated renderer can consume them in a later slice.

## Out Of Scope

- UI layout changes beyond exposing the necessary projection data.
- Dedicated Long Free Pyramid control renderer.
- Hiding or simplifying the single-frame match structure in the UI.
- Cross-game correction commands.
- In-game break-off choice modeling after rack rollover.
- Extending rack tracking to regular Free Pyramid, Combined Pyramid, or Combined Pyramid old rules.
