# Authoritative Machine Sessions Epic

## Status

Implemented historical strategy for replacing parallel gameplay and match behavior with authoritative XState definitions. Its match-level commit-before-apply and resident actor design was superseded on 2026-08-23 by `decisions/speculative-resident-match-execution.md`; the replacement plan is `speculative-match-execution-spec.md`. Gameplay's current resident-session design remains unchanged pending separate simplification.

The project is unreleased. Obsolete runtime and reducer APIs are removed after parity rather than retained as compatibility paths.

## Outcome

The hot path has four authoritative machine definitions:

1. `StrilaSparringFrameMachine`,
2. one configured `PyramidSparringFrameMachine` for regular pyramid variants,
3. `LongFreePyramidSparringFrameMachine`,
4. `SparringMatchMachine`.

One MatchRoom instance retains at most:

```text
one SparringMatchSession
  -> one resident sparring actor
  -> zero or one resident GameplaySession
       -> one frame actor selected by game key
```

Accepted match facts in MatchRoom SQLite are durable authority. Resident sessions are disposable behavioral authority and are reconstructed by deterministic replay after eviction or invalidation.

## Ownership

### Gameplay

`@ks/gameplay` owns frame-machine definitions, typed game commands, game transitions, outcomes, protocol entries, and game projections. Its production server API exposes opaque resident sessions and factories. Raw machines are tooling exports.

### Competition

`@ks/competition` owns sparring lifecycle policy, match command decisions, frame sequencing, breaker policy, match targets, gameplay-session coordination, fact drafts, replay, and room projection.

### MatchRoom

MatchRoom owns one match per Durable Object, command serialization, IDs and timestamps, SQLite transactions, fact sequences, receipts, resident-session lifetime, live delivery, finalizing lock, and disposal. It does not implement match or game rules.

### Application

`@ks/application` owns global catalog checks, MatchRoom RPC adaptation, and terminal archive/dispose/finish sequencing. It consumes production projections and journals rather than reconstructing a parallel state model.

## Cross-Slice Contracts

### Commit Before Apply

An accepted command follows this order:

```text
resident session decides without mutation
  -> returns fact drafts + opaque prepared transition
  -> MatchRoom envelopes and commits facts + receipt
  -> resident session applies prepared transition against exact committed facts
  -> MatchRoom broadcasts and responds
```

Persistence failure leaves resident actors unchanged. Post-commit application failure clears the resident cache and preserves the committed journal for cold restoration.

### Replay

Cold replay starts with `match.created`, constructs the sparring session, creates the selected gameplay session at `frame.started`, reapplies accepted `game.command` facts, disposes the gameplay session at `frame.completed`, and verifies terminal `match.ended` ordering.

For the same valid journal and code version:

```text
warm committed state == cold replay state
warm projection == cold projection
```

Replay generates no IDs, timestamps, writes, broadcasts, or external effects.

### Command Outcomes

Malformed transport input, expected domain rejection, idempotency conflict, and defects remain distinct. Expected rejection is a tagged value and receives an idempotent rejected receipt. Defects throw and never become empty acceptance.

### Facts And Causation

Browsers submit commands; MatchRoom creates accepted facts. The target vocabulary is:

- `MatchFactDraft`: semantic type and payload,
- `MatchFact`: accepted envelope,
- `StoredMatchFact`: accepted envelope plus storage sequence and receipt time,
- `AcceptedFactRef`: sequence and fact ID.

Every fact caused by one submitted command carries the same `causedByCommandId`. `match.created` has no command causation. This groups atomic command batches and preserves a future generic undo path without implementing undo in this epic.

### Match Lifecycle

`SparringMatchMachine` starts initialized in `between-frames`. Its states are:

```text
between-frames
frame-in-progress
match-over
```

Game-level `winner-determined` and `awaiting-award` remain match-level `frame-in-progress`. `frame.award` closes the frame. A match-winning award emits ordered `game.command`, `frame.completed`, and `match.ended` facts in one accepted batch and transitions directly to terminal `match-over`.

### Persistence

Raw XState snapshots are not persisted. Full journal replay is the initial restoration strategy. Domain checkpoints and rules-version retention are separate future decisions.

## Slice Order

Each slice starts after the previous slice is accepted.

1. [Resident gameplay contract and Strila](sparring-match-machine/01-gameplay-session-strila.md)
2. [Configured regular pyramid machine](sparring-match-machine/02-pyramid-machine.md)
3. [Long free pyramid machine](sparring-match-machine/03-long-free-pyramid-machine.md)
4. [Production sparring lifecycle machine](sparring-match-machine/04-sparring-lifecycle-machine.md)
5. [Sparring aggregate session and replay](sparring-match-machine/05-sparring-session-replay.md)
6. [Fact envelope and tagged receipts](sparring-match-machine/06-facts-receipts-storage.md)
7. [MatchRoom production wiring](sparring-match-machine/07-match-room-wiring.md)
8. [Remove parallel authority and stabilize exports](sparring-match-machine/08-authority-cleanup.md)
9. [Game-specific typed command parsing](sparring-match-machine/09-typed-game-commands.md)

The first eight slices complete the authority migration. Slice 9 tightens the remaining transport-to-domain command boundary.

## Review Protocol

For each slice, the lead/reviewer agent must:

1. Read this strategy and the slice file.
2. Verify the previous slice exit criteria in the current tree.
3. Assign only the current slice to an implementation agent.
4. Reject new parallel runtimes, reducers, command policies, or persistence representations.
5. Review behavior, tests, exports, deletions, and generated assets against the slice checklist.
6. Require the slice verification commands and `bun run check` to pass.
7. Accept the slice before opening the next one.

Temporary parity implementations and tests are permitted only in the slice that names them. They are deleted by that slice's exit gate or by Slice 8 where explicitly stated.

## Epic Acceptance

The epic is complete when:

- all four machine definitions are the sole implementations of their behavior,
- every active frame uses one resident actor-backed gameplay session,
- MatchRoom retains one package-owned sparring session and no domain reducer cache,
- decisions do not mutate resident actors,
- only committed facts advance actors,
- cold replay equals warm application for every registered game,
- command-produced facts carry durable command causation,
- accepted and rejected receipts are explicit and idempotent,
- snapshots, controls, finalization, and completed archives use the production session/replay path,
- MatchRoom contains no breaker, winner, gameplay-transition, or control-merging policy,
- raw machine exports exist only on tooling subpaths,
- the explorer imports tooling subpaths rather than package source files,
- obsolete reducers, imperative runtimes, aliases, and parity harnesses are deleted,
- `bun run check` passes,
- MatchRoom and machine-explorer builds pass.

## Later Work

The completed architecture supports later vertical slices for command undo, active-rules versioning, replay checkpoints, tournament formats, and hibernatable WebSockets. Those capabilities receive their own strategy and acceptance criteria.
