# Snapshot-Backed Gameplay Session Simplification

## Status

Implementation plan for `decisions/snapshot-backed-gameplay-sessions.md`. It begins only after speculative match execution from `speculative-match-execution-spec.md` is implemented.

The implementation replaces the old gameplay interface directly. The project is unreleased, so there are no aliases, parallel sessions, restoration compatibility, dormant projection exports, or state fallbacks.

## Target interface

```ts
export type NonEmptyProtocolEntries = readonly [ProtocolEntry, ...ProtocolEntry[]]

export type GameCommandExecution =
  | {
      readonly _tag: 'accepted'
      readonly protocolEntries: NonEmptyProtocolEntries
      readonly outcome?: FrameOutcome
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: GameCommandRejection
    }

/** Resident gameplay for one active frame of a registered game. */
export interface GameplaySession<K extends RegisteredGameKey> {
  readonly gameKey: K

  /**
   * Executes one trusted typed game command.
   *
   * Rejection leaves the retained snapshot unchanged. Acceptance validates non-empty protocol and canonical terminal
   * output before assigning the candidate snapshot as the final operation.
   *
   * @param command - A command already parsed for this session's registered game key.
   * @returns Expected rejection or the semantic output of one accepted transition.
   * @throws An unrecoverable defect when machine, protocol, or outcome invariants fail.
   */
  execute(command: GameCommandFor<K>): GameCommandExecution

  /** @returns A fresh copy of the current frame score by seat. */
  getScore(): BySeatNumber

  /**
   * Reports whether the game machine accepts commencement by the proposed seat.
   *
   * Competition remains authoritative for which seat is the scheduled breaker.
   */
  canCommence(seat: Seat): boolean

  /** @returns A fresh keyed browser control projection for the current snapshot. */
  deriveControl(): ControlProjectionFor<K>
}
```

The expected rejection remains:

```ts
export type GameCommandRejection = {
  readonly code: 'command-not-available'
}
```

Malformed transport commands never reach this interface. `parseGameCommand` remains the command representation adapter and returns typed `GameCommandFor<K>`. `parseGameControl` remains the keyed control representation adapter used by application to validate untrusted MatchRoom projections.

## Keyed creation

Creation types are server-only:

```ts
export type GameplaySessionCreateArgsByKey = {
  readonly 'strila-v2': {
    readonly targetPointsBySeat: BySeatNumber
  }
  readonly 'free-pyramid': {
    readonly targetPointsBySeat: BySeatNumber
  }
  readonly 'free-pyramid-long': {
    readonly targetPointsBySeat: BySeatNumber
    readonly rackRollover: 14 | 15
  }
  readonly 'combined-pyramid': {
    readonly targetPointsBySeat: BySeatNumber
  }
  readonly 'combined-pyramid-old': {
    readonly targetPointsBySeat: BySeatNumber
  }
}

export type GameplaySessionCreateArgsFor<K extends RegisteredGameKey> = GameplaySessionCreateArgsByKey[K]

/**
 * Creates fresh gameplay at the initial machine snapshot.
 *
 * @param gameKey - The registered game selecting one private family implementation.
 * @param args - Creation input correlated with that game key.
 * @returns Fresh gameplay waiting for frame commencement.
 * @throws An unrecoverable defect when the private registry is incomplete or machine input is invalid.
 */
export function createGameplaySession<K extends RegisteredGameKey>(
  gameKey: K,
  args: GameplaySessionCreateArgsFor<K>,
): GameplaySession<K>
```

Competition adapts validated `MatchConfig` into this keyed input. The only game-specific configuration branch is long free pyramid rack rollover. That branch adapts representation; it does not select gameplay rules.

## Execution algorithm

Every family session follows this ordering:

```text
read previous private snapshot
  -> check exact typed command through machine guards
  -> rejection: return without transition or mutation
  -> calculate one candidate snapshot
  -> derive ordered protocol from previous snapshot, command, and candidate snapshot
  -> validate protocol schema and non-empty invariant
  -> if terminal, validate candidate machine output as FrameOutcome
  -> construct accepted result and defensive output copies
  -> assign candidate snapshot
  -> return without any further operation that can throw
```

The snapshot assignment is the only resident mutation. Machine actions calculate a private candidate and must preserve XState's immutable-snapshot behavior.

`getScore()` copies seat values. Machine creation copies targets and rack configuration. Protocol and control outputs allocate fresh objects and arrays.

## Machine authority

All three machines produce canonical terminal output:

```ts
output: ({ context }): FrameOutcome => ({
  winnerSeat: requireWinner(context),
  score: copyScore(context),
  winReason: 'target-reached',
})
```

Strila may retain its detailed winner-determination reason in private context for presentation and tooling. Sessions do not reconstruct `FrameOutcome` from another representation.

Machine guards own exact typed command availability. Move Strila selected-ball availability into machine-owned calculations used by its pot guards. Remove session and tooling-helper copies.

Also make existing Strila authority gaps explicit:

- penalty selection accepts only the opponent of the recorded foul offender,
- winner-determined pot commands accept only the winner seat,
- fully specified winner controls follow that exact machine availability.

Control projections follow two availability modes:

- a fully specified control may query the exact event through `snapshot.can`,
- an interactive launcher derives its selectable range from the same private snapshot and machine-owned calculations; the final composed event is validated by machine guards.

Strila pot controls remain one launcher plus available-ball data. Do not enumerate every possible `pottedBalls` combination.

## Snapshot-only family implementation

Each private concrete class retains one exact snapshot type:

```ts
class PyramidGameplaySession<K extends PyramidGameKey> implements GameplaySession<K> {
  readonly gameKey: K
  #snapshot: PyramidSparringFrameSnapshot
  #rules: PyramidRulesFor<K>
}
```

Keep three coherent implementations in their family modules. The configured pyramid class serves its three keys through keyed rules.

Delete custom family state schemas and types. Control and protocol modules consume exact previous/current/next snapshots directly. Phase helpers may return normalized strings for presentation but must not assemble another state object.

Keep low-level calculations snapshot-agnostic when machines already import them. In long free pyramid, machine and projection code pass `snapshot.context.racks` into rack/score calculations; calculations must not import the machine snapshot and create a circular dependency. Assemble presentation details in the control module.

Raw machines and snapshots remain exported only through the three tooling subpaths. Tooling subpath names and export policy remain unchanged; machine output types change to canonical `FrameOutcome`. `definitions` and `server` never export snapshots.

## Typed server registry

Keep the public metadata registry browser-safe. Keep one private server registry correlating command schema and creator:

```ts
type GameplayServerEntry<K extends RegisteredGameKey> = {
  readonly commandSchema: v.GenericSchema<GameCommandFor<K>>
  readonly create: (args: GameplaySessionCreateArgsFor<K>) => GameplaySession<K>
}

type GameplayServerRegistry = {
  readonly [K in RegisteredGameKey]: GameplayServerEntry<K>
}
```

The registry is exhaustive over all five keys and dispatches to three family-local implementations. It contains no scoring, phases, protocol, outcome, or projection policy.

One localized key-correlation assertion is acceptable when TypeScript cannot preserve dependent indexing. Its `// SAFETY:` comment must name the exhaustive registry and matching key. Do not erase family snapshot state through `unknown`, `object`, JSON, symbols, carriers, or a `WeakMap`. Parser input remains `unknown` because it is an actual representation boundary; that is not state erasure.

Do not add an injectable registry, public factory interface, generic family base class, or callback-driven machine adapter.

## Supported package surfaces

`@ks/gameplay/definitions` retains only:

- metadata, registry, and registered keys,
- command schemas and keyed command types,
- control schemas and keyed control types,
- browser-required Strila ball metadata.

`@ks/gameplay/server` retains only:

- command parsing, control parsing, and canonical command payload,
- expected gameplay rejection,
- keyed creation types and factory,
- `GameplaySession` and `GameCommandExecution`.

Tooling machine subpaths remain unchanged.

Delete public state, summary, scoreboard, and protocol-specific correlations unless a current external consumer is found during implementation. Generic `ProtocolEntry` remains the accepted output contract.

## Competition usage after candidate 1

Competition retains gameplay through a mapped discriminated union:

```ts
type CorrelatedGameplay = {
  [K in RegisteredGameKey]: {
    readonly gameKey: K
    readonly session: GameplaySession<K>
  }
}[RegisteredGameKey]
```

It does not inspect raw state or snapshots. Exhaustive creation dispatch is allowed to adapt broad `MatchConfig` into keyed creation arguments. Localized assertions are allowed only after runtime game-key equality checks; family state is never erased to `unknown`.

Dynamic typed command execution may use one exhaustive game-key correlation dispatcher in competition when TypeScript cannot call a generic method through the mapped union. Warm execution and cold replay share that dispatcher. It contains no rules, score, protocol, outcome, or projection policy; repeated per-operation key switches fail the deletion test.

```text
frame.started
  -> adapt keyed creation arguments
  -> createGameplaySession

typed game command
  -> gameplay.execute
  -> rejection: match rejection, no match mutation
  -> acceptance: game.command content from non-empty protocol
  -> optional FrameOutcome drives frame completion

frame concession
  -> gameplay.getScore

room projection
  -> gameplay.canCommence(active breaker)
  -> gameplay.deriveControl
```

Once gameplay actors disappear, remove `SparringMatch.dispose()` and every gameplay disposal path from competition, MatchRoom, and completed archive replay.

Cold restoration always creates gameplay from `frame.started` and executes accepted commands. There is no direct gameplay restoration operation.

## Deleted projection and state surface

Delete all summary and scoreboard implementation files, schemas, types, registry correlations, package exports, and tests. Reintroduce presentation projections only with a real route/live consumer.

Delete:

- `StrilaFrameStateSchema` / `StrilaFrameState`,
- `PyramidFrameStateSchema` / `PyramidFrameState`,
- `LongFreePyramidFrameStateSchema` / `LongFreePyramidFrameState`,
- `GameStateFor`,
- `SummaryProjectionFor`,
- `ScoreboardProjectionFor`.

Internal machine context and phase types remain where they directly describe machine implementation.

## Test ownership

### Machines

Own guards, legal transitions, scoring, phases, configured rules, Strila ball availability, long-pyramid rack rollover, and canonical terminal `FrameOutcome`.

### Controls

Own exact browser command sections, presentation details, and interactive selectable ranges for representative private snapshots. They do not retest score transitions.

### Protocol

Own exact ordered entries, system-note ordering, and score-after behavior from previous snapshot, typed command, and next snapshot. They do not retest transition legality.

### Gameplay session

Replace the exported contract-suite generator and family session suites with one table-driven `gameplay-session.test.ts` covering all five keys:

- keyed creation and exact game key,
- defensive initial score copies,
- commencement availability,
- keyed control schema,
- representative accepted execution and non-empty protocol,
- representative rejection with unchanged score and control,
- terminal execution exposes a schema-valid outcome without reasserting winner, score, or reason owned by machine tests,
- deterministic fresh-session command replay,
- fresh returned control objects and score copies.

The table uses one representative trace per adapter. It does not repeat each family's scoring, control, or protocol matrix.

### Higher modules

Competition tests breaker policy, concession, fact ordering, outcome-to-completion, and warm/cold match replay. MatchRoom and application tests retain only their runtime/storage/orchestration responsibilities.

Each assertion has one primary owner. Reusing a short trace is allowed; repeating the same assertion is not.

Control tests own mutation isolation for nested browser output, including one score case and one long-free nested-array case. Do not add a production injection seam merely to force impossible protocol or machine-output defects. Snapshot-assignment ordering is a reviewed implementation invariant; family tests validate protocol and terminal output schemas through reachable commands.

## Implementation slices

### Slice 1: Machine and projection authority

While preserving the existing session interface temporarily:

- make all machine outputs canonical `FrameOutcome`,
- move Strila selected-ball availability, penalty chooser seat, and winner-pot seat policy into machine-owned guards/calculations,
- change control and protocol modules to consume snapshots,
- establish machine/control/protocol test ownership,
- adapt the old session implementation mechanically without adding aliases or new supported interface.

Exit gate:

- sessions no longer reconstruct target-reached outcomes,
- no duplicated Strila ball-availability rule,
- machine explorer and production agree on Strila chooser-seat and winner-pot availability,
- control launchers and exact commands follow the two availability modes,
- protocol/control functions consume snapshots rather than custom state,
- focused gameplay tests and `bun run check` pass,
- machine explorer build passes.

### Slice 2: Vertical gameplay replacement

Replace the supported session interface, three concrete adapters, keyed factory, competition consumer, and replay consumer together. Delete actors, tokens, state/restoration, disposal, summary, scoreboard, and obsolete tests in this slice.

Do not begin this slice against the current match-level commit-before-apply implementation. Speculative match execution is a hard prerequisite because mutable gameplay execution advances before MatchRoom persistence.

Exit gate:

- target interface is the complete `@ks/gameplay/server` resident surface,
- definitions surface contains only current client consumers,
- no gameplay actor, prepared transition, lifecycle, or direct restoration remains,
- no custom gameplay state representation remains,
- no summary or scoreboard artifact remains,
- no gameplay state erasure to `unknown`, `object`, JSON, carrier, symbol, or `WeakMap`,
- raw machines remain tooling-only,
- all new and materially changed supported interfaces satisfy `AGENTS.md` JSDoc rules,
- central session tests and owner-specific machine/control/protocol tests replace old suites,
- record the pre-slice hand-written production/test baseline and demonstrate material net deletion without displacement into new generic modules,
- full verification passes.

### Final architecture reconciliation

Update active architecture documentation and mark historical gameplay-session slices explicitly superseded. The implemented source and package entrypoints must match this plan without compatibility exports.

## Hard deletion gate

Identifier-aware searches must find no production or test use of:

```text
PreparedGameTransition
PreparedGameCommandResult
GameCommandDecision
GameplaySessionDisposedError
GameplaySessionUnusableError
InvalidPreparedTransitionError
GameCreateStateArgs
GameplaySessionFactoryArgs
restoreGameplaySession
createGameplaySessionArgsFromState
StrilaFrameState
PyramidFrameState
LongFreePyramidFrameState
GameStateFor
SummaryProjectionFor
ScoreboardProjectionFor
deriveSummary
deriveScoreboard
restoreSnapshot
serializeSnapshot
snapshotsEqual
restoredState
```

Additional structural gates:

- no gameplay production `Actor`, `createActor`, `.send()`, or `.stop()`,
- no owner, revision, consumed-token, candidate-evidence, disposal, or unusable machinery,
- no `resolveState` gameplay restoration,
- no breaker or generic optional configuration in gameplay creation,
- long free creation cannot typecheck without rack rollover,
- no summary or scoreboard implementation files,
- no raw state/snapshot export through `definitions` or `server`,
- machine explorer is the only application importing machine tooling subpaths,
- no cross-family generic base or state-erased registry,
- no competition switch for score, control, protocol, or outcome; game execution has at most one shared exhaustive key-correlation dispatcher,
- every accepted execution produces schema-valid non-empty protocol,
- final outcome comes from machine output,
- session snapshot assignment occurs after every candidate validation.

## Verification

Run after every slice:

```text
bun test packages/gameplay/src
bun run --cwd packages/gameplay typecheck
bun run check
bun run --cwd do/match-room typecheck:integration
bun run --cwd do/match-room test:integration
bun run --cwd apps/machine-explorer build
bun run build
```

No Drizzle migration or dependency installation is required.
