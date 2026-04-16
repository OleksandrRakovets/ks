# T004 - later 0.x club history and lookup

## Status

- [ ] Planned

## Why

Once live control, permissions, and scoreboards are working, the next product value comes from reusing the recorded data: finding matches, avoiding duplicate players, and deriving simple useful stats.

## Outcome

Recorded matches become club memory rather than just live-session state.

## Scope

- player lookup/create flow with duplicate avoidance,
- recent matches and filtering,
- lookup by player and other useful list dimensions,
- basic stats derived from real stored matches,
- tournament setup that selects from verified player records rather than freeform player names,
- tournament matches linked to verified player records,
- sparring matches that still allow guest-entered player names,
- manager-created records and workflows where selective guest editors are still useful.

## Dependency

- This task assumes the signed-in manager auth, club, and verified-player-record foundations from `T002A` already exist.
- Build lookup/history flows on those entities instead of inventing a parallel player or owner model.

## Acceptance

- operators can find previously recorded matches,
- common player duplication is reduced,
- tournament setup does not allow freeform player names when verified player records are required,
- tournament matches can reliably link to verified player records,
- sparring matches can still be recorded with freeform guest player names,
- the stored match data is useful for at least one real lookup/stat workflow the club cares about.

## Open Point

- Do not over-model stats before there is a concrete first query/report screen to support.
