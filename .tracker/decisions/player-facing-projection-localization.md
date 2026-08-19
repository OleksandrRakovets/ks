# Player-Facing Projection Localization

## Status

Accepted

## Context

Gameplay and competition control projections previously carried rendered English labels, effect summaries, and messages. Play rendered those values directly, preventing locale selection at the UI boundary.

`situationTitle` and `situationSummary` are different: they are English annotations for the internal machine explorer and are not player-facing UI.

## Decision

Control commands and player-facing messages cross package boundaries as locale-neutral command data and semantic codes. Play maps those codes to `@ks/i18n` messages when rendering.

Gameplay and competition do not emit rendered player-facing copy. Internal machine-explorer annotations remain English strings in gameplay projections.

## Consequences

Rules packages remain independent of locale resources.

New player-facing control text requires a semantic code plus translations in Play, rather than a string literal in gameplay or competition.
