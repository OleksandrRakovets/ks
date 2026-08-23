# Snapshot-Backed Gameplay Sessions

## Status

Accepted on 2026-08-23. This combines the gameplay-session deepening and deletion of direct materialized-state restoration. Its prerequisite, `speculative-resident-match-execution.md`, is implemented; the replacement plan is `../gameplay-session-simplification-spec.md`.

## Context

Gameplay has three concrete machine families serving five registered game keys. Competition needs one active gameplay implementation without learning family snapshots or scoring rules.

The current `GameplaySession` interface exposes a match-like commit-before-apply protocol: non-mutating decision, prepared transition, owner and revision checks, actor application, candidate verification, disposal, and unusable state. All three families repeat that implementation. A second restoration seam manually reconstructs XState snapshots from custom game-family state objects even though accepted match facts already restore gameplay by replaying typed commands.

The session also exposes raw state plus control, summary, and scoreboard projections. Competition consumes only control, score, and whether the frame is waiting to commence. Summary and scoreboard have no production consumer.

## Decision

### Supported server interface

Gameplay remains a mutable, opaque, in-process module for one active frame:

```ts
interface GameplaySession<K extends RegisteredGameKey> {
  readonly gameKey: K

  execute(command: GameCommandFor<K>): GameCommandExecution
  getScore(): BySeatNumber
  canCommence(seat: Seat): boolean
  deriveControl(): ControlProjectionFor<K>
}
```

Concrete classes are private. Each class retains its exact XState snapshot type in a private field. There is no second class interface, generic base class, state-erased adapter, opaque carrier, or `WeakMap` record.

### Execution

`execute` accepts an already parsed typed command.

- Expected unavailability returns `{ _tag: 'rejected' }` and does not mutate.
- Acceptance calculates one candidate snapshot through the machine.
- Protocol entries are ordered, runtime-valid, and non-empty.
- A terminal outcome is the machine's canonical `FrameOutcome` output.
- The candidate snapshot becomes resident only after protocol and outcome validation succeeds.
- A defect before assignment leaves the previous snapshot resident.

Gameplay has no prepared transition, owner, revision, actor, disposal, or unusable lifecycle. Candidate 1's speculative match execution clears the entire resident match after any later aggregate or persistence failure.

### Machine authority

- XState machines remain the only transition and exact command-availability authority.
- Every machine's terminal output is `FrameOutcome`.
- Sessions do not reconstruct outcomes from another state representation.
- Strila ball availability belongs to machine-owned guards and calculations, not a session-side check.

Fully specified browser controls may query exact machine availability. An interactive control such as Strila pot recording is a command-building launcher rather than a complete machine event. Its selectable range derives from the same private snapshot and machine-owned availability calculations; the final composed typed command is validated by machine guards. Gameplay does not enumerate every possible ball combination.

### State representation

The XState snapshot is the sole game-family state representation. Delete:

- `StrilaFrameState`,
- `PyramidFrameState`,
- `LongFreePyramidFrameState`,
- their schemas,
- snapshot serializers and restorers,
- public state correlations.

Control and protocol implementations consume private family snapshots directly. Family phase helpers may normalize XState values for presentation without assembling another complete state object.

The generic core `FrameState` remains the product-level match representation for frame index, breaker, score, and winner. It is not a gameplay-machine snapshot.

### Restoration

Gameplay can be created only from initial frame configuration. It cannot be restored from derived state.

Cold match restoration:

1. Creates gameplay when accepted `frame.started` is replayed.
2. Executes each accepted typed game command through the normal gameplay interface.
3. Verifies regenerated protocol and terminal outcome through competition's aggregate replay.

There is no gameplay checkpoint, serialized snapshot, rules-version adapter, or compatibility path.

### Creation

Creation arguments are correlated with the registered game key.

- Every game requires `targetPointsBySeat`.
- Long free pyramid additionally requires `rackRollover: 14 | 15`.
- Other games cannot accept rack rollover configuration.
- Gameplay creation never accepts `breakerSeat`; competition owns breaker policy.
- Gameplay creation never accepts an optional generic `gameConfiguration` object.

Creation inputs are defensively copied before the machine retains them.

### Reads and projections

- `getScore()` returns a fresh `BySeatNumber` for the active frame.
- `canCommence(seat)` queries availability for the exact proposed commencement event; competition independently owns wrong-breaker policy.
- `deriveControl()` returns a fresh browser-facing keyed control projection.
- Raw snapshots, contexts, phases, and custom state do not cross the server interface.
- Returned values and nested arrays cannot mutate retained machine context.

Summary and scoreboard projections, schemas, public correlations, implementation files, and tests are deleted. They return only with a real presentation consumer.

### Package seams

`@ks/gameplay/definitions` is browser-safe and exposes:

- metadata and registered keys,
- typed game commands and schemas,
- control projections and schemas.

`@ks/gameplay/server` exposes:

- typed command parsing,
- keyed control parsing for application RPC validation,
- keyed gameplay creation arguments and factory,
- `GameplaySession`, execution result, and expected rejection.

The private server registry correlates command schema and factory for every key through mapped types. It may use one localized key-correlation assertion when TypeScript cannot preserve dependent indexing. It must not erase family snapshot state to `unknown`, `object`, serialized JSON, or an opaque carrier.

Raw machine and snapshot exports remain available only through explicit tooling subpaths for machine explorer and focused machine tests.

### Family locality

Keep three family-local session implementations:

- Strila,
- configured regular pyramid,
- long free pyramid.

Do not introduce a cross-family base class or callback-heavy generic machine adapter by default. Share a helper only when deletion demonstrates substantial identical mechanics after the old infrastructure is gone.

## Testing rule

Each invariant has one primary owner:

- machine tests: rules, guards, phases, score changes, terminal output,
- control tests: exact browser presentation and interactive ranges,
- protocol tests: exact ordered entries from previous snapshot, command, and next snapshot,
- one table-driven gameplay-session test: common supported interface across all five keys,
- competition tests: frame/match coordination and warm/cold aggregate replay,
- MatchRoom tests: persistence, eviction, receipts, and publication ordering.

The same short trace may cross multiple modules, but tests must not repeat the same assertion. Delete the exported contract-suite generator and family session suites after their unique assertions move to the owning machine, control, protocol, or central session test.

## Consequences

### Removed complexity

- three actor lifecycles,
- gameplay prepared transitions and token bookkeeping,
- owner, revision, stale, foreign, reuse, and candidate-equality checks,
- disposal and unusable state,
- direct state restoration and state-derived creation arguments,
- three custom state representations,
- summary and scoreboard projection surfaces,
- raw state and phase knowledge in competition,
- duplicated outcome reconstruction.

### Retained complexity

- three genuinely different family adapters,
- keyed command and control correlation,
- family protocol and control projection logic,
- XState machine rules and tooling exports,
- full journal replay for cold restoration.

### Deletion test

Deleting the resulting gameplay module would force competition to learn family snapshots, machine guards, configured pyramid rules, Strila ball policy, score extraction, protocol projection, outcome extraction, and browser controls. The module therefore provides real depth, leverage, and locality.
