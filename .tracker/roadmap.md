# KS Roadmap

This is the primary planning document for release work.

- Keep milestone goals concise here.
- Keep implementation detail in linked task files under `.tracker/tasks/`.
- Keep durable architecture constraints in `.tracker/decisions/current-architecture.md`.
- Keep DB inspection/reset notes in `.tracker/db.md`.
- When a task is finished, mark it done in the task file and add a short dated note here.

## Product Direction

KS is a scorekeeping app for the local billiards club.

Primary product goal:

- run real matches comfortably,
- stream or display live scores when needed,
- later reuse recorded data for lookup and stats.

Primary engineering goal:

- learn through a modular architecture that lets game logic, UI, and app runtime evolve without rewriting everything.

## Core Use Cases

- two-player match scoring from phone or laptop,
- a public live scoreboard that auto-updates,
- later: managed broadcast scoreboards with persistent URLs,
- later: history, lookup, and stats from recorded matches.

## Game Scope

Current and near-term game direction:

- free pyramid,
- extended free pyramid,
- combined pyramid,
- combined pyramid (old rules),
- Strila.

Later or harder modes:

- двоборство,
- multiplayer.

## Current Ground Truth

- The production track is the RR7 app on Cloudflare.
- SSE + Durable Object sync is good enough to keep building on.
- `packages/gameplay` already has Pyramid and Strila runtimes.
- The main missing product surface is the real app UX:
  - match creation is disabled,
  - control UI is still Pyramid-oriented,
  - Strila is not wired into the app control surface yet,
  - broadcast management is intentionally deferred.

## Milestones

### 0.1 - Live Match Control UI

Goal: make KS genuinely usable for live sparring matches from phone or laptop.

In scope:

- minimal match setup flow,
- per-game control molecules in the app,
- strong mobile-first control UX,
- support for Strila and Pyramid games,
- multi-device live consistency during scoring.

Out of scope:

- manager auth,
- guest invitation/permissions beyond the current broad control path,
- managed broadcast scoreboards,
- player lookup/dedup,
- tournament flows.

Task links:

- [x] [T001 - v0.1 control UI](./tasks/001-v0.1-control-ui.md)

### 0.2 - Access And Permissions

Goal: replace the rough control-secret model with a guest/session-based access model and add the smallest useful management helpers.

In scope:

- guest identity cookie,
- canonical match URL,
- invite flow for granting edit access to another device,
- read-only vs editable state on the same match route,
- enough operator tooling to understand and share access safely.

Task links:

- [ ] [T002 - v0.2 access and permissions](./tasks/002-v0.2-access-and-permissions.md)

### 0.25 - Better Auth And Manager/Player Foundations

Goal: add the signed-in manager auth and ownership foundation needed for later management features without replacing the guest/session sharing model.

In scope:

- Better Auth integration,
- manager account/session foundations,
- clubs and minimal membership roles,
- super-admin bootstrap import for the initial verified player list,
- verified player record foundations distinct from manager accounts,
- clear coexistence between guest access and manager-owned resources.

Task links:

- [ ] [T002A - v0.25 Better Auth and manager/player foundations](./tasks/002a-v0.25-better-auth-and-club-foundations.md)

### 0.3 - Managed Scoreboards

Goal: introduce persistent scoreboard endpoints that club or tournament managers can own and attach to live matches.

In scope:

- persistent scoreboard records and URLs,
- attach/detach flow,
- read-only public display surface,
- keep SSE as the live update mechanism.

Task links:

- [ ] [T003 - v0.3 managed scoreboards](./tasks/003-v0.3-managed-scoreboards.md)

### Supporting Work

Cross-milestone work that should be tracked separately when needed.

- [ ] [T005 - deploy flow and versioning](./tasks/005-deploy-flow-and-versioning.md)

### Later 0.x - Club Memory And Lookup

Goal: make the app useful beyond live operation by letting the club find and learn from the matches it already recorded.

Likely scope:

- player lookup and creation flow,
- match history and filtering,
- basic stats and lookups from real stored matches,
- tournament setup based on verified player records,
- tournament matches linked to verified player records,
- sparring matches with guest-entered player names.

Task links:

- [ ] [T004 - later 0.x club history and lookup](./tasks/004-later-0x-history-and-lookup.md)

### 1.0 - Usage-Based Threshold

`1.0` is not tied to one feature. We promote when the club has used KS enough in real conditions that the core workflow feels dependable:

- create and run live matches comfortably,
- grant the right people edit access,
- drive managed scoreboards for streams,
- find past matches and pull useful lookup/stat data,
- operate without obvious missing pieces blocking regular use.

## Execution Order

1. Finish `0.1` before taking on access-model work.
2. Finish `0.2` before treating broadcast management as a product surface.
3. Finish `0.25` before taking on management-oriented ownership UI.
4. Finish `0.3` before spending real effort on history/stats UX.
5. Use real club usage to decide what enters late `0.x` and what can wait past `1.0`.

## Notes

- 2026-04-16: `T001` completed on the RR7 app branch with minimal match setup, gameplay-driven Pyramid and Strila control molecules, live sparring control on `/sparring/matches/:matchId`, and multi-device SSE sync kept in place.
- 2026-04-15: milestone ladder revised in conversation: `0.1` control UI, `0.2` guest access and permissions, `0.25` Better Auth and manager/player foundations, `0.3` managed scoreboards, then later `0.x` club lookup/history/stats, with `1.0` promoted by real usage rather than by a single feature gate.
- 2026-04-15: `intro.md`, the numbered decision records, and the old first-pass report were collapsed into the roadmap, tasks, and a single current architecture note.
