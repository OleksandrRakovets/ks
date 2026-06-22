# Strila Winner Determination vs Frame Outcome

## Status

Accepted

## Context

Strila has game-local ways to determine a frame winner: reaching the target, winning the respotted black, or losing by automatic foul. The match layer has a smaller `FrameOutcome.winReason` vocabulary: `target-reached` or `conceded`.

Using `winReason` for both layers made it look like Strila's local reasons should flow directly into `FrameOutcome.winReason`. They should not.

## Decision

Strila frame state records the game-local reason as `winnerDeterminationReason`.

`FrameOutcome.winReason` remains match-level. When a Strila frame is completed by rules, including respotted black or automatic foul, the runtime emits `FrameOutcome.winReason: 'target-reached'`. External concession remains `FrameOutcome.winReason: 'conceded'`.

## Consequences

Protocol and projections can still explain the Strila-specific reason for determining the winner.

Competition/match scoring receives a stable, game-agnostic frame outcome reason.

Tests that assert Strila rules should use `winnerDeterminationReason`; tests that assert match-level completion should use `FrameOutcome.winReason`.
