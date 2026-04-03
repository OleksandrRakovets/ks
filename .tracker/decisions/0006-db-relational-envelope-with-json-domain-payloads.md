# 0006 - Use a Relational Envelope with JSON Domain Payloads

## Status

Proposed

## Context

The system needs to support games with materially different internal state and configuration:

- Pyramid can use target-by-seat frame rules and handicap values like `9/7`.
- Strila needs richer table-state data and different win logic.
- Competition policy may add per-frame setup adjustments such as floating handicap.

Trying to force all game- and policy-specific data into fully normalized relational columns would create brittle schemas too early.

At the same time, some fields must remain query-friendly across all games and modes.

## Decision

1. Keep stable, cross-game, cross-mode envelope fields as relational columns.
2. Store game-specific and competition-specific variability in JSON payloads.
3. Only normalize additional fields when a concrete cross-match query/reporting need appears.

## Relational fields should cover

- identity,
- lifecycle,
- ownership or grouping,
- filtering and indexing dimensions,
- event envelope metadata.

Examples:

- `matches.match_id`
- `matches.game_key`
- `matches.mode`
- `matches.status`
- `matches.created_at`
- `matches.started_at`
- `matches.ended_at`
- future `club_id` / `competition_id` / similar grouping keys
- participant seat rows
- event envelope fields such as `seq`, `event_id`, `type`, `client_id`, `at`, `received_at`

## JSON fields should cover

- match config,
- handicap payload,
- competition policy payload,
- per-frame effective setup if needed,
- event payload details,
- game state snapshots,
- cached game-specific projections if caching is later justified.

Examples:

- Pyramid target-by-seat handicap payload
- Strila starting score adjustment payload
- Strila table state
- floating handicap frame adjustments
- game-specific command payloads

## Consequences

- The schema can support richer games without premature normalization.
- Query-friendly operational fields stay indexed and understandable.
- Game- and competition-specific evolution remains cheaper while the domain is still being discovered.
- Reporting needs should drive future normalization rather than speculation.

## Guardrails

- Do not bury key list/filter dimensions in JSON if they are needed for routine queries.
- Do not create generic scoreboard columns that only really fit one game family.
- Do not normalize game internals until a real product/reporting use case requires it.

## Follow-up

- Revisit the exact relational columns once the first real match lists are defined, for example recent sparring matches, active competition matches, and matches by player or club.
