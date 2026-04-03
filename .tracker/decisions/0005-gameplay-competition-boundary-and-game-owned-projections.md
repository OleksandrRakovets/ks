# 0005 - `gameplay` Owns Game Semantics; `competition` Owns Match Administration Policy

## Status

Proposed

## Context

The original intent of splitting `gameplay` and `competition` was to keep the app as ignorant as possible about game specifics while still allowing richer competition features later.

That split is justified by the games under consideration:

- Pyramid and Strila differ not only in scoring rules, but also in state shape, available controls, and public display needs.
- Pyramid can use equivalent-ball scoring and target-by-seat handicap.
- Strila needs richer table state such as available balls, currently "on" balls, remaining points, and frame win logic that depends on score difference versus balls left.
- Some organized competition flows need controls that should not exist in sparring mode, such as floating handicap adjustments between frames.

## Decision

1. Keep the package split between `gameplay` and `competition`.
2. Define the boundary as follows:

### `gameplay` owns

- game config schema,
- handicap schema and interpretation,
- game state shape,
- game command schema,
- command legality and reduction,
- frame-win logic derived from game state,
- game-specific control projection,
- game-specific public display projection,
- game-specific summary projection if needed.

### `competition` owns

- match mode such as `sparring` vs `competition`,
- allowed operator actions by mode,
- referee/admin interventions,
- frame-boundary policy,
- floating handicap and other between-frame adjustments,
- result finality/editability policy,
- later tournament orchestration.

3. The shared app should consume projections, not game internals.
4. Control and display must be game-owned projections rather than one generic scoreboard/control DTO.
5. Handicap is a shared concept but not a shared algorithm:
   - storage may carry handicap data in a common envelope,
   - each game validates and interprets its own handicap payload.
6. Competition policy may adjust effective per-frame setup, but the underlying game still interprets that setup.

## Examples

- Pyramid handicap can change target-by-seat values such as `9/7` or `10/6`.
- Strila handicap can be represented as an arbitrary starting score advantage such as `-4`.
- Floating handicap in Pyramid is not a core game rule; it is a competition policy that may revise effective handicap between frames and should not exist in sparring mode.

## Consequences

- The generic layer must stop assuming all games reduce to score deltas and a shared scoreboard shape.
- Adding Strila should not require changing generic routes or the match kernel.
- Sparring and competition can reuse the same game definitions with different administration policies.
- `competition` now has a concrete purpose beyond re-exporting match services.

## Guardrails

- Do not let the app infer game controls from hardcoded game keys.
- Do not keep generic control helpers that encode Pyramid assumptions as shared truth.
- Do not normalize handicap into one fake cross-game rule set.
- Do not let tournament or referee concerns leak into the core game reducer unless they are truly game semantics.

## Open Questions

- Whether competition-level adjustments should be persisted in the same event log or remain separate administrative state.
- The exact contract shape for `GameDefinition`, `CompetitionPolicy`, and app-facing projections.
