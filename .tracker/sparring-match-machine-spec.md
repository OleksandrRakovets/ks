# Sparring Match Machine Integration Spec

## Status

Proposed implementation specification for the P0 item in `.tracker/authoritative-match-machine.md`: make the XState sparring match machine the sole behavioral authority for a sparring match and wire it into MatchRoom's production command, replay, and projection paths.

This document specifies interfaces, ownership, call stacks, migration slices, and test changes. Re-read the relevant slice before implementing it.

The project has not been deployed. There is no remote active journal or persisted XState snapshot requiring backward compatibility. Preserve useful public behavior and fact meaning, but do not retain the parallel reducer as a permanent compatibility path.

## Scope

This task includes:

- four authoritative XState machine definitions in the hot path: Strila frame, regular pyramid frame, long free pyramid frame, and sparring match,
- one resident gameplay-session contract implemented by all three frame-machine families,
- removal of imperative gameplay runtimes after temporary behavioral parity coverage,
- a production `SparringMatchMachine`,
- one authoritative sparring aggregate state,
- deterministic creation and fact replay,
- explicit match-command decisions,
- coordination with the resident gameplay-session abstraction,
- a package-owned resident session cached by MatchRoom,
- match snapshot and control projection from authoritative state,
- production MatchRoom integration,
- removal of the independent `MatchState` reducer path,
- migration of the machine explorer to the production machine,
- tests from gameplay through competition, MatchRoom, and application adaptation.

This task does not include:

- tournament match behavior,
- a generic universal match machine,
- frame reopen or undo behavior,
- WebSocket transport work,
- Play redesign or browser end-to-end tests,
- persisted XState snapshots or domain checkpoints,
- application-wide failure-code migration,
- full game-command schema redesign beyond the minimum boundary needed to distinguish expected rejection from defects.

## Four Authoritative Machines

The intended hot path has four authoritative machine definitions:

1. `StrilaFrameMachine`,
2. `PyramidFrameMachine`, configured for regular pyramid variants,
3. `LongFreePyramidFrameMachine`,
4. `SparringMatchMachine`.

This does not mean four actor instances live inside every Durable Object. One MatchRoom owns at most:

```text
one resident SparringMatch actor
  + zero or one resident frame actor selected by game key
```

When no frame is active, only the sparring actor is resident. `frame.started` creates the selected gameplay session and actor. `frame.completed` stops and discards it.

Current implementation status:

- Strila uses its XState machine indirectly but reconstructs a snapshot from plain state for every command,
- the regular pyramid XState machine exists but production uses a separate imperative runtime,
- long free pyramid has an imperative runtime and no current machine,
- the sparring match machine exists but MatchRoom uses a separate reducer and command policy.

The migration must not leave any of these parallel implementations as permanent behavioral authorities.

## Naming And Future Variants

`Sparring` is a domain format, not a prototype qualifier. Use production names:

- `SparringMatchMachine`,
- `SparringMatchState`,
- `SparringMatchCommand`,
- `SparringMatchDecision`,
- `SparringMatchSession`.

Do not use `MatchMachine` as though one lifecycle necessarily covers every future format. A future tournament capability may use `TournamentMatchMachine` or orchestrate a sparring-like match under tournament policy. Extract shared behavior only after a second real format demonstrates it.

## Authority And Ownership

### Competition owns

`@ks/competition` owns:

- sparring lifecycle states and guards,
- match configuration interpretation,
- frame sequence and breaker policy,
- match target and winner policy,
- legal match command decisions,
- coordination of game results into frame completion,
- deterministic application of accepted facts,
- cold replay and warm incremental evolution,
- authoritative match and control projections,
- the resident session abstraction and its internal XState actor/snapshot mechanics.

### Gameplay owns

`@ks/gameplay` owns:

- the three authoritative frame-machine definitions,
- game-specific state,
- game-specific command parsing and legality,
- game-specific transitions,
- frame outcomes,
- protocol entries,
- control, summary, and scoreboard projections.

Competition consumes the registered gameplay runtime facade. It must not import concrete Strila or pyramid machines.

### MatchRoom owns

MatchRoom owns:

- one Durable Object per match,
- RPC validation and command deduplication,
- SQLite transactions,
- accepted-fact sequence allocation,
- fact IDs and reception metadata,
- command receipts,
- resident-session lifetime,
- concurrency serialization,
- live replay and broadcast,
- finalizing lock and terminal disposal.

MatchRoom must not decide match lifecycle legality, calculate breakers or winners, apply concrete gameplay rules, or assemble domain projections itself.

### Facts remain durable authority

Accepted facts in MatchRoom SQLite remain the durable source from which the session is reconstructed. The XState machine is the behavioral authority that defines how those facts evolve state.

The resident session is disposable. Losing it must affect performance only, not correctness.

## Machine Export Decision

Production consumers should not receive the raw XState machine or actor types through the root `@ks/competition` API.

The root package should expose domain-facing operations and opaque session types. `@ks/competition` should own actor creation, restoration, transition mechanics, and serialization into stable domain projections.

MatchRoom may store a `SparringMatchSession` object in memory, but it should not call `createActor`, `actor.send`, `resolveState`, or inspect raw XState context directly.

The raw production machine may remain available from an intentional tooling subpath:

```text
@ks/competition/sparring-match-machine
```

That subpath exists for the machine explorer, focused machine topology tests, and XState inspection. It is not the MatchRoom integration contract and is not a persistence format.

The raw-machine boundary remains useful, but the current Strila runtime is not the desired residency precedent. It reconstructs an XState snapshot from plain state for every command because it was designed as a stateless runtime. Revise gameplay's server interface so one active frame has one package-owned resident game session backed by its authoritative machine.

Do not expose a module singleton. The ownership is one session instance per active frame inside one MatchRoom. Gameplay owns how that session uses an actor; competition and MatchRoom use only the opaque gameplay session interface.

## Stable Domain State

The authoritative domain state must not be a raw XState persisted snapshot. It should be a validated projection of machine state and active gameplay state. A production `SparringMatchSession` always represents an initialized match; MatchRoom handles an absent match before constructing a session.

Conceptually:

```ts
type SparringMatchBase = {
  readonly config: MatchConfig
  readonly frames: ReadonlyArray<FrameState>
  readonly framesWonBySeat: BySeatNumber
  readonly currentFrameIndex: number
}

type SparringMatchState =
  | (SparringMatchBase & {
      readonly phase: 'between-frames'
      readonly activeGame: null
    })
  | (SparringMatchBase & {
      readonly phase: 'frame-in-progress'
      readonly activeGame: AnyActiveGameState
    })
  | (SparringMatchBase & {
      readonly phase: 'match-over'
      readonly winnerSeat: Seat
      readonly activeGame: null
    })
```

The exact field layout may change while implementing the machine, but preserve these invariants:

- every session state has validated configuration,
- `frame-in-progress` has exactly one active game,
- a game's internal `winner-determined` phase remains `frame-in-progress` at match level and retains the active game,
- the match records a frame outcome only when the game reaches `frame-over`, normally through `frame.award`,
- `between-frames` and `match-over` have no active game,
- `match-over` has a winner,
- current frame index and frames cannot disagree,
- active game key equals match configuration game key,
- completed frame count and frame wins agree,
- match-over is terminal.

### Active game representation

Use a game-keyed tagged union:

```ts
type ActiveGameState<K extends RegisteredGameKey> = {
  readonly gameKey: K
  readonly state: GameStateFor<K>
}

type AnyActiveGameState = {
  [K in RegisteredGameKey]: ActiveGameState<K>
}[RegisteredGameKey]
```

Move this concept from MatchRoom's `active-game.ts` into the owning domain integration surface. It correlates a registered key with its gameplay state and is not a Durable Object concern.

The resident session guarantees one match machine plus zero or one active gameplay session. Every production gameplay session in this architecture retains its authoritative XState actor/snapshot internally. Strila stops reconstructing its machine from scratch for every warm command; regular pyramid stops using its parallel imperative runtime; long free pyramid gains its own machine rather than being forced into the regular pyramid lifecycle.

### No empty machine state

A named Durable Object can be addressed before its SQLite match row exists, but that is a MatchRoom existence condition, not a sparring lifecycle state. `MatchRoom.create` validates configuration and commits `match.created`; only then does it construct the production session. Other RPC methods return unknown match without creating a session.

Cold restoration requires the first stored fact to be `match.created`. An empty journal or a first fact of another type is an absent/corrupt room result, not `SparringMatchState`.

## Stable Schemas

Provide Valibot schemas for representation boundaries:

- `SparringMatchCommandSchema`,
- `SparringMatchStateSchema` if state crosses a cache/checkpoint boundary,
- fact payloads remain owned by existing core fact schemas,
- game-specific commands remain parsed by gameplay.

Do not parse stable typed state on every internal function call. Parse at RPC, persisted fact, restored state, or future checkpoint boundaries.

Do not persist raw XState state values or context in this task.

## Commands, Facts, And Machine Events

Keep three vocabularies distinct.

### External control envelope

The existing shared `ControlCommand` remains the RPC/application transport envelope during this task:

```ts
type ControlCommand = {
  readonly source: 'match' | 'game'
  readonly commandType: string
  readonly command: ControlCommandPayload
}
```

### Parsed sparring commands

Competition parses match-owned commands into a closed union:

```ts
type SparringMatchCommand =
  | { readonly type: 'frame.start' }
  | { readonly type: 'frame.commence'; readonly seat: Seat }
  | { readonly type: 'frame.concede'; readonly seat: Seat }
  | {
      readonly type: 'game.command'
      readonly commandType: string
      readonly command: ControlCommandPayload
    }
```

`frame.commence` is match-owned because the sparring match determines the required breaker, even though accepted commencement also advances the active game.

The nested game command remains broad only for this P0 task. The following P1 command-parsing slice replaces it with a game-specific parsed command selected by game key.

There is no separate `match.end` command or `match-point-reached` phase. Reaching a game-level `winner-determined` phase does not complete its frame: the active game remains available so the winner can record permitted final balls. When `frame.award` advances the game to `frame-over`, the game runtime returns a frame outcome. The confirmed product behavior is automatic match completion: the sparring decision emits `frame.completed` and, when that outcome reaches the match target, `match.ended` in the same ordered accepted batch.

### Fact drafts

Competition decisions return semantic fact drafts without infrastructure metadata:

```ts
type MatchFactDraft =
  | { readonly type: 'match.created'; readonly payload: MatchConfig }
  | { readonly type: 'frame.started'; readonly payload: FrameStartedPayload }
  | { readonly type: 'game.command'; readonly payload: GameCommandPayload }
  | { readonly type: 'frame.completed'; readonly payload: FrameCompletedPayload }
  | { readonly type: 'match.ended'; readonly payload: MatchEndedPayload }
```

The concrete type should be derived from the renamed match-fact payload variants rather than duplicating payload definitions.

Drafts do not contain:

- fact ID,
- event timestamp,
- stored sequence,
- received timestamp.

MatchRoom adds the accepted-event envelope before persistence; `ActiveMatchStore` adds storage sequence and reception time.

### Fact terminology

`ClientFact` is stale and misleading in the current architecture. Browsers submit commands; they do not construct accepted facts. MatchRoom decides commands and creates facts using a hard-coded server client ID, so `clientId` and `clientSeq` no longer identify a real fact producer.

Rename the fact vocabulary during this migration:

```ts
type MatchFactDraft = {
  // semantic type and payload only
}

type MatchFact = MatchFactDraft & {
  readonly factId: FactId
  readonly matchId: MatchId
  readonly occurredAt: UnixEpochMilliseconds
}

type StoredMatchFact = MatchFact & {
  readonly seq: number
  readonly receivedAt: UnixEpochMilliseconds
}

type AcceptedFactRef = {
  readonly seq: number
  readonly factId: FactId
}
```

Unless a concrete offline/client-authored fact requirement is identified before implementation, remove `ClientId`, `clientId`, and `clientSeq` from the fact envelope and MatchRoom SQLite schema. `CommandId` already owns request idempotency. If future commands need actor/device attribution, model that explicitly on the command or fact origin rather than retaining an unexplained client field.

### Internal machine events

The XState machine consumes internal accepted lifecycle events derived from facts. These events may resemble fact payloads, but they are package-private unless tooling needs them.

Do not send raw RPC commands directly to the resident actor. A command is first decided; only committed facts advance the resident authoritative machine.

## Rejection And Defect Types

The decision API returns expected rejection as a value:

```ts
type SparringMatchRejection =
  | { readonly code: 'frame-already-active' }
  | { readonly code: 'no-active-frame' }
  | { readonly code: 'wrong-breaker'; readonly expectedSeat: Seat }
  | { readonly code: 'match-already-over' }
  | { readonly code: 'unsupported-match-command' }
  | { readonly code: 'game-command-rejected'; readonly reason: string }
```

This is an initial semantic inventory, not a required final spelling. Keep only distinctions that change client recovery, diagnostics, or tests.

Malformed command payloads should be represented separately from state-dependent rejection when the gameplay API supports that distinction. Until the P1 game-command parsing slice, translate only known gameplay rejection errors; do not catch every exception.

Defects still throw, including:

- an accepted fact cannot be applied,
- persisted match IDs or game keys disagree,
- a gameplay session returns an invalid outcome,
- machine state contradicts the fact journal,
- a registered game key is not exhaustively handled.

## Gameplay Session Interface

Revise `@ks/gameplay/server` from a stateless runtime-only facade to a resident-session facade. This is required to benefit from one active frame per MatchRoom without exposing concrete game machines.

Conceptually:

```ts
export interface GameplaySession<K extends RegisteredGameKey> {
  readonly gameKey: K
  readonly state: GameStateFor<K>

  decide(commandType: string, command: ControlCommandPayload): GameCommandDecision<K>

  applyCommitted(transition: PreparedGameTransition<K>): GameCommandResult<GameStateFor<K>>

  deriveControl(): ControlProjectionFor<K>
  deriveSummary(): SummaryProjectionFor<K>
  deriveScoreboard(): ScoreboardProjectionFor<K>
}

export function createGameplaySession<K extends RegisteredGameKey>(gameKey: K, args: GameCreateStateArgs): GameplaySession<K>
```

The exact heterogeneous union may require an exhaustive game-key adapter inside gameplay or competition. Keep that narrowing away from MatchRoom.

Required behavior:

- one session instance belongs to one active frame,
- `decide` uses XState's pure transition capability and returns a candidate result plus an opaque prepared transition, or expected rejection,
- `applyCommitted` adopts/sends that prepared transition only after the corresponding match facts commit,
- decision and committed application are deterministic and agree,
- projections read the resident state,
- session disposal occurs when `frame.completed` commits,
- cold replay creates a new session from `frame.started` and reapplies later `game.command` facts.

`PreparedGameTransition<K>` is in-memory and opaque outside gameplay. It belongs to the session and revision that created it, is never persisted, and cannot be reused after another transition.

Concrete package-private implementations are:

- `StrilaGameplaySession`, backed by `StrilaFrameMachine`,
- `PyramidGameplaySession<K>`, backed by one configured `PyramidFrameMachine`,
- `LongFreePyramidGameplaySession`, backed by `LongFreePyramidFrameMachine`.

The regular pyramid machine serves free pyramid, combined pyramid, and combined pyramid old through parsed machine input/rules. Variant differences belong in named guards, actions, and configuration, not separate nearly identical machines.

Long free pyramid has a separate machine because rack history, rollover, balls remaining, `awaiting-award`, and multi-rack accumulation are distinct lifecycle concepts. Reuse pure calculations where useful, but do not turn the regular pyramid machine into a flag-driven union of unrelated lifecycles.

Keep imperative/stateless runtimes only as temporary characterization oracles during migration. For the same initial state and command sequence, old runtime output must equal new machine-session output. Delete each old runtime and parity harness after its machine session becomes authoritative.

## Public Competition Interfaces

The root `@ks/competition` production surface should converge on the following responsibilities.

### Creation

```ts
function draftSparringMatchCreation(config: MatchConfig): MatchFactDraft
```

Creation receives an already parsed `MatchConfig` and returns the `match.created` draft. There is no empty-session decision: MatchRoom owns the distinction between an absent room and an existing match. It persists the creation fact and then constructs a session from that committed fact.

If a direct `createSparringMatchSession(config)` helper exists for tests or tooling, document that it creates transient initialized state and does not replace persistence-first production creation.

### Parsing

```ts
function parseSparringMatchCommand(command: ControlCommand): Result<SparringMatchCommand, ParseCommandFailure>
```

Use the repository's established small tagged-union style rather than adding a result dependency. MatchRoom receives a parsed `ControlCommand` from RPC validation but still needs competition to classify match-versus-game semantics.

### Decision

```ts
type SparringMatchDecision =
  | {
      readonly _tag: 'accepted'
      readonly facts: ReadonlyArray<MatchFactDraft>
      readonly transition: PreparedSparringMatchTransition
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: SparringMatchRejection
    }

function decideSparringMatchCommand(state: SparringMatchState, command: SparringMatchCommand): SparringMatchDecision
```

The public decision appears pure. Gameplay runtime lookup is a private package detail through `@ks/gameplay/server`; do not require MatchRoom to construct or inject a gameplay dependency bag unless testing demonstrates a real need.

Decision must not mutate the resident session or produce infrastructure metadata. It uses pure match/game machine transitions to calculate protocol entries, an optional frame outcome, fact drafts, and an opaque prepared transition.

### Apply and replay

```ts
function applySparringMatchFact(state: SparringMatchState, fact: MatchFact | StoredMatchFact): SparringMatchState

function replaySparringMatch(facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): SparringMatchState
```

These functions are deterministic and immutable from the caller's perspective. Replay requires a non-empty journal whose first fact is `match.created`. MatchRoom handles a missing room before calling replay; an invalid first fact is journal corruption.

Applying a `game.command` re-executes deterministic gameplay transition logic through the gameplay session to reconstruct active game state. Stored protocol entries remain historical output and are not regenerated for archival. During tests, compare regenerated protocol entries with stored entries to detect drift where practical.

### Projection

```ts
function projectSparringMatchRoom(state: SparringMatchState, latestSeq: number): SparringMatchRoomProjection
```

The projection contains:

- keyed `MatchSnapshotFor<K>`,
- optional keyed game control projection,
- merged match/game control sections.

This absorbs the domain behavior currently split between `snapshotFromMatchState`, `deriveSparringControlSections`, and MatchRoom's `active-game.ts`.

### Resident session

```ts
export interface SparringMatchSession {
  readonly state: SparringMatchState

  decide(command: SparringMatchCommand): SparringMatchDecision

  applyCommitted(transition: PreparedSparringMatchTransition, facts: readonly StoredMatchFact[]): void

  project(latestSeq: number): SparringMatchRoomProjection
}

export function restoreSparringMatchSession(facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): SparringMatchSession
```

The concrete session implementation is package-private. It retains the running match actor/snapshot and owns the current gameplay session. Callers cannot send arbitrary machine events.

`latestSeq` remains MatchRoom cache metadata rather than session domain state. MatchRoom verifies its resident cache sequence against SQLite before reuse.

`PreparedSparringMatchTransition` is an opaque, in-memory capability tied to the session revision that produced it. It may contain the prepared gameplay transition. MatchRoom can hold and return it to the session but cannot inspect, persist, or construct it.

`applyCommitted` accepts the prepared transition and exact facts returned by a successful SQLite commit. It verifies that committed semantic facts match the decision, advances the match and game actors, and invalidates the transition. If it fails, MatchRoom must discard the resident session and reconstruct from storage before serving another domain operation.

## Internal Machine Interface

Inside competition, model lifecycle transition independently from orchestration that calls gameplay.

Conceptually:

```ts
type SparringLifecycleEvent =
  | { readonly type: 'frame.started'; readonly frame: ActiveFrameMetadata }
  | { readonly type: 'frame.completed'; readonly outcome: FrameOutcome }
  | { readonly type: 'match.ended'; readonly winnerSeat: Seat }
```

`match.created` constructs the initialized machine using `MatchConfig` as machine input. It is not a transition from an artificial empty state. Replay consumes the first creation fact to instantiate the machine, then applies later lifecycle facts.

The machine should not execute SQL, generate IDs, read time, broadcast, or call application services.

Gameplay command execution can remain in a competition aggregate function around the lifecycle machine:

1. inspect authoritative match phase,
2. prepare the command through the resident gameplay session when required,
3. produce semantic fact drafts,
4. validate the candidate lifecycle by pure machine transition,
5. return accepted drafts and an opaque prepared transition without mutating resident state.

Committed fact application performs the actual resident transition.

This avoids XState actions with hidden gameplay dependencies and keeps the machine inspectable in the explorer.

## Production Call Stacks

### Room creation

```text
Application.createMatch
  -> MatchRoom.create RPC
  -> parse request and build MatchConfig
  -> competition drafts match.created from parsed config
  -> MatchRoom adds fact envelope metadata
  -> SQLite transaction:
       initialize active_matches
       insert match.created
       advance latestSeq
  -> restore or create resident session from committed fact
  -> return created match ID
```

The session is never considered authoritative before the transaction commits.

### Warm command

```text
Application.submitMatchCommand
  -> MatchRoom.submitCommand RPC
  -> parse RPC body
  -> blockConcurrencyWhile
  -> check deleted/finalizing/match identity
  -> resolve existing command receipt
  -> load resident session whose seq equals SQLite latestSeq
  -> competition parses ControlCommand
  -> session.decide(parsed command)
       -> inspect XState lifecycle
       -> prepare gameplay-machine transition if required
       -> return rejection or semantic fact drafts + prepared transition
  -> on rejection:
       persist/return rejection receipt according to receipt decision below
  -> on acceptance:
       MatchRoom adds IDs/time envelope
       SQLite commits facts + accepted receipt atomically
       session.applyCommitted(prepared transition, exact committed StoredMatchFacts)
       broadcast committed non-terminal facts
       return accepted fact references and finalizing flag
```

The operation names describe their stage:

- Play and application **submit** a requested command,
- competition **decides** whether it is accepted,
- the session **applies** committed facts.

Avoid `commandMatch`, whose noun/verb reading is ambiguous, and avoid `applyCommand` at ingress because nothing is authoritative until persistence commits.

### Cold command after eviction

```text
MatchRoom instance constructed
  -> no resident session
  -> command RPC enters serialized section
  -> read active match row and ordered accepted facts
  -> competition.restoreSparringMatchSession(facts)
       -> apply every fact through production machine/gameplay runtime
  -> cache { latestSeq, session }
  -> continue through warm command path
```

### Snapshot

```text
MatchRoom.snapshot
  -> load resident session
  -> session.project(SQLite latestSeq)
  -> return keyed room projection
```

### Finalization

Finalization ownership remains unchanged:

```text
match.ended committed
  -> active match row becomes finalizing
  -> application requests finalization material
  -> MatchRoom returns facts and terminal projection/snapshot
  -> application archives in D1
  -> MatchRoom broadcasts terminal fact, closes live clients, deletes storage
  -> application marks D1 catalog finished
```

The archived snapshot must be projected from the same authoritative session/replay API, not the removed reducer.

## Commit-Before-Apply Rule

Never permanently advance the resident session before SQLite commits.

Required order:

1. decide against current state without mutation,
2. produce fact drafts and an opaque prepared transition,
3. add envelope metadata,
4. commit facts and receipt transactionally,
5. apply the prepared transition with exact committed facts to the resident session,
6. broadcast committed facts,
7. update resident cache sequence.

If `applyCommitted` unexpectedly fails after commit:

- do not roll back or delete committed facts,
- discard the resident session,
- surface the defect for the current request,
- reconstruct from SQLite on the next attempt,
- if replay also fails, treat the journal as corrupt/incompatible and fail closed.

If persistence fails, discard the prepared transition and leave both resident actors unchanged.

## Resident Cache Shape

MatchRoom should converge on:

```ts
type ResidentRoom = {
  readonly latestSeq: number
  readonly session: SparringMatchSession
}
```

Reuse it only when `resident.latestSeq === activeMatch.latestSeq`.

There is at most:

- one resident sparring match session,
- zero or one active gameplay session inside that session.

Do not persist the resident session or raw actor snapshot in this task. Full replay is expected to be inexpensive for a local billiards match and occurs only after eviction, deployment, or invalidation.

## Command Receipt Decision

Rejected commands need idempotent behavior, but the current receipt stores only accepted fact references and encodes rejection as empty success.

Change the receipt payload to a tagged outcome:

```ts
type CommandReceiptOutcome =
  | {
      readonly _tag: 'accepted'
      readonly accepted: ReadonlyArray<AcceptedFactRef>
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: SparringMatchRejection
    }
```

Persist a receipt for a parsed, well-formed command that receives a domain rejection. Repeating the same command ID and exact request returns the same outcome even if match state later changes.

Do not persist a normal command receipt for:

- malformed RPC input,
- command ID conflict,
- storage failure,
- an internal defect.

This requires a MatchRoom SQLite schema/migration change. Because the project has not deployed, update and regenerate the initial MatchRoom migration rather than adding a legacy migration solely for unreleased storage.

The public RPC result should distinguish accepted and rejected outcomes. Application and Play mapping may remain minimal until their later failure-contract and UI slices, but rejection must not masquerade as `{ ok: true, accepted: [] }`.

## Protocol And Replay Policy

`game.command` facts store both the accepted command and protocol entries generated at acceptance time.

During replay:

- apply the stored command to reconstruct gameplay state,
- treat stored protocol entries as historical presentation output,
- do not overwrite or append protocol entries,
- in focused tests, compare regenerated entries with stored entries for current-version journals.

An incompatible gameplay rules change can alter replay after a deployment. Before the first deployment that allows matches to remain active across code upgrades, choose a rules-version policy, such as recording a gameplay definition version in `frame.started` and retaining compatible runtimes. That policy is important but is not required to wire the current unreleased machine correctly.

## File And Module Direction

The exact file split should follow cohesion rather than this list mechanically. A likely gameplay shape is:

```text
packages/gameplay/
  contract/server.ts                         gameplay-session production facade
  src/gameplay-session.ts                    shared session contracts and game-key factory
  src/strila-v2/{machine,session}.ts         authoritative Strila machine/session
  src/pyramid/{machine,session}.ts           configured regular pyramid machine/session
  src/long-free-pyramid/{machine,session}.ts authoritative long machine/session
```

Do not keep parallel `runtime.ts` implementations after parity. A session file may absorb a runtime file rather than forcing this exact naming.

A likely competition shape is:

```text
packages/competition/src/
  sparring-match-machine.ts     XState lifecycle definition and internal transition helpers
  sparring-match.ts             public state, decisions, replay, session, projections
  matches.ts                    creation request/config helpers
```

Avoid preserving both `match-state.ts` and `sparring-match.ts` after migration.

Likely MatchRoom changes:

```text
do/match-room/src/
  MatchRoom.ts                  RPC, receipt, transaction, cache, live orchestration
  active-game.ts               delete or reduce to MatchRoom-only response adaptation
  storage/store.ts             tagged command receipt persistence
```

The competition package may import `@ks/gameplay/server`. Gameplay must continue not to import competition.

## Public Export Shape

During migration, keep the existing machine subpath only as long as needed for the explorer and parity tests.

Target package exports:

```json
{
  ".": "./src/index.ts",
  "./sparring-match-machine": "./src/sparring-match-machine.ts"
}
```

Root production exports should include only the stable domain-facing contracts needed by MatchRoom and application consumers, such as:

- creation schemas and helpers,
- `SparringMatchState` if required by projections/tests,
- `SparringMatchDecision`,
- `SparringMatchRejection`,
- `SparringMatchSession`,
- `restoreSparringMatchSession`,
- room projection result types.

Keep internal:

- actor implementation type,
- raw machine snapshot type,
- internal machine events,
- XState restoration details,
- concrete session class,
- migration parity helpers.

The tooling subpath may export the raw machine and inspection helpers, with JSDoc stating that it is not a persistence or MatchRoom integration contract.

`@ks/gameplay/server` should likewise export gameplay session factories/interfaces, not concrete raw machines or a process-wide singleton. Concrete machine exports remain tooling or package-internal concerns.

If the machine explorer continues to inspect all frame machines directly, expose intentional tooling subpaths rather than source-relative imports:

```text
@ks/gameplay/strila-machine
@ks/gameplay/pyramid-machine
@ks/gameplay/long-free-pyramid-machine
```

These subpaths expose machine definitions and inspection types only. They are not production session or persistence contracts.

## Test Strategy

Build confidence in dependency order: gameplay machines and sessions, sparring lifecycle, competition orchestration/replay, MatchRoom, then application adaptation. Do not start from Play.

### Level 1: Gameplay machine and session tests

Define one shared gameplay-session contract suite and run it against Strila, configured regular pyramid variants, and long free pyramid. It verifies:

- one session owns one resident actor,
- decision uses a pure transition and does not mutate the actor,
- expected rejection is distinct from a defect,
- accepted decision returns an opaque prepared transition,
- applying the prepared transition advances the actor exactly once,
- applying a stale or foreign prepared transition fails,
- warm sequential commands reuse resident machine state,
- replaying accepted commands into a fresh actor yields the same state,
- control, summary, and scoreboard projections read current actor state,
- `frame-over` returns a schema-valid outcome,
- protocol entries are deterministic,
- commands after `frame-over` reject.

Keep specialized scenarios for:

- Strila fouls, respotted black, and continued scoring after `winner-determined`,
- regular pyramid variant rules and continued winner scoring,
- long free pyramid rack rollover, balls remaining, accumulated score, and `awaiting-award`.

During migration, run characterization parity between each old imperative/stateless runtime and its new machine session for representative command sequences. Delete the old implementation and parity harness when that machine session becomes authoritative. Production competition code must consume `@ks/gameplay/server`, not concrete machines.

### Level 2: Sparring XState lifecycle tests

Rewrite `packages/competition/src/match-sparring-machine.test.ts` around production semantics.

Test:

- constructing the machine from parsed configuration starts in `between-frames`,
- frame start enters `frame-in-progress`,
- breaker alternates from configured first breaker,
- awarding a non-winning frame records its outcome and returns to `between-frames`,
- awarding a match-winning frame records its outcome and enters terminal `match-over`,
- no frame starts after target,
- terminal state accepts no lifecycle transition,
- context and state projection satisfy the stable schema after every transition.

Do not assert that invalid commands are silently ignored. Machine-facing transition helpers must report whether a transition was accepted; aggregate tests own user-facing rejection reasons.

These tests may import the tooling machine subpath or internal file because they verify machine topology.

### Level 3: Competition decision tests

Add focused tests through the root production API.

For each match-owned command, test:

- accepted fact drafts and opaque prepared transitions,
- rejected phase combinations,
- wrong-breaker rejection,
- concession outcome from current game summary,
- game-level `winner-determined` does not complete the frame or discard the gameplay session,
- automatic `match.ended` after a completed frame reaches the match target,
- no `match.ended` while the game is only `winner-determined`,
- no state mutation during decision,
- no IDs, timestamps, or storage sequences in drafts.

For each registered game key, test at least one command path proving that:

- frame creation selects the right gameplay machine session,
- accepted game command produces a `game.command` draft,
- a game outcome also produces `frame.completed` in the same ordered batch,
- protocol entries are captured in the game-command fact draft.

### Level 4: Replay and equivalence tests

Replace the long-term role of `packages/competition/src/match-state.test.ts` with replay tests against the production API.

Core invariant:

```text
state after applying committed facts incrementally
  == state after replaying the journal from its match.created fact
```

Also verify:

- decision does not mutate either resident actor,
- applying a prepared transition after commit reaches the expected next state,
- warm incremental apply and cold replay project the same snapshot/control,
- facts from another match fail closed,
- non-sequential frame facts fail closed,
- mismatched game key/config fail closed,
- impossible accepted fact order fails closed,
- replay reconstructs the selected gameplay actor midway through a frame,
- replay reconstructs no gameplay actor between frames and after completion,
- terminal replay produces the same winner and snapshot.

During migration only, compare projections from old `deriveMatchState` and the new production session for representative existing fact sequences. Delete the parity test with the old reducer.

### Level 5: Competition control projection tests

Migrate `packages/competition/src/control.test.ts` to project from authoritative session state rather than handcrafted broad `MatchState` values.

Test observable controls by phase:

- frame start between frames,
- commence for the required breaker,
- concede while gameplay is active,
- game controls remain available while the game is `winner-determined`,
- no controls after terminal state,
- game controls merge into the correct seat/prominence buckets.

Avoid testing private merge implementation when the projected sections demonstrate behavior.

### Level 6: MatchRoom contract tests

Replace direct construction of `MatchState` and `ActiveGameState` in `do/match-room/src/MatchRoom.contract.test.ts` with restored competition sessions or production projections.

Test that MatchRoom's RPC schemas and response adaptation agree with the competition package, without reimplementing domain state fixtures.

### Level 7: MatchRoom storage and integration tests

Add integration coverage through the actual MatchRoom methods and SQLite seam when the Cloudflare test environment supports it.

Required scenarios:

1. create room, commit `match.created`, project initial controls,
2. warm command acceptance and persisted facts,
3. same command ID and same body returns same accepted receipt,
4. same command ID and different body returns conflict,
5. domain rejection persists and replays the same rejected receipt,
6. defect does not become a rejected or empty-success receipt,
7. discard resident session and cold-replay identical projection,
8. reinstantiate MatchRoom and continue an active game,
9. frame-awarding game command commits `game.command` and `frame.completed` atomically,
10. a match-winning frame award also commits `match.ended`, locks the room, and exposes finalization material,
11. disposal removes storage and prevents later use,
12. malformed stored fact or receipt fails closed.

If a complete Durable Object harness is unavailable in the first slice, test the same sequence through `ActiveMatchStore` plus a MatchRoom command-session coordinator extracted only if it represents a real production seam. Do not build a second fake MatchRoom implementation.

### Level 8: Application tests

Application behavior should need only result-shape fixture updates:

- accepted MatchRoom result remains accepted,
- explicit rejected result maps without pretending facts were accepted,
- finalizing accepted command still triggers archive flow,
- defects/rejected commands do not trigger finalization.

Do not expand Play or browser coverage in this task.

### Level 9: Machine explorer

Point match mode at the production `SparringMatchMachine` tooling export and production event meanings.

The explorer may synthesize accepted frame outcomes for visualization, but label this as machine inspection rather than full MatchRoom/gameplay integration. Prefer using package inspection adapters so it cannot drift into another lifecycle implementation.

## Existing Test Disposition

| Existing suite                               | Disposition                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `competition/match-sparring-machine.test.ts` | Rewrite for production lifecycle topology                                   |
| `competition/match-state.test.ts`            | Convert to replay/equivalence tests, then remove old reducer coverage       |
| `competition/control.test.ts`                | Project controls from authoritative session                                 |
| `competition/matches.test.ts`                | Retain creation/schema tests; adjust production creation helper names       |
| Strila runtime/API/scenario tests            | Convert to resident machine-session contract and scenarios                  |
| pyramid machine and runtime tests            | Reconcile with one configured authoritative machine; remove runtime parity  |
| long free pyramid runtime tests              | Characterize behavior, build machine scenarios, then remove runtime parity  |
| `MatchRoom.contract.test.ts`                 | Stop hand-building old `MatchState`; consume competition session/projection |
| `storage/accepted-fact-row.test.ts`          | Rename around stored match facts; remove obsolete client-origin columns     |
| broadcaster tests                            | Retain unchanged                                                            |
| application use-case tests                   | Rename submit operation and update explicit command result fixtures         |

## Implementation Slices

### Slice 1: Gameplay session contract and resident Strila

- Define `GameplaySession`, command decisions, prepared transitions, and the game-keyed factory in `@ks/gameplay/server`.
- Implement `StrilaGameplaySession` around the existing Strila machine.
- Retain its actor/snapshot across warm commands instead of restoring from plain state on every call.
- Add the shared session contract and Strila characterization parity.
- Move production Strila calls to the session and remove the stateless runtime path after parity.

Exit criterion: Strila has one authoritative resident machine-session implementation and passes warm/replay equivalence.

### Slice 2: Authoritative configured pyramid machine

- Reconcile the existing pyramid prototype with current `PyramidGameplayRuntime` behavior.
- Model free pyramid, combined pyramid, and combined pyramid old as parsed machine rules/input on one machine definition.
- Implement `PyramidGameplaySession<K>` and run the shared session contract for every configured variant.
- Preserve specialized winner-determined, foul, handicap, and negative-score scenarios.
- Remove the imperative pyramid runtime and temporary parity harness after equivalence.

Exit criterion: every regular pyramid key selects one configured authoritative resident pyramid machine.

### Slice 3: Authoritative long free pyramid machine

- Use the current long runtime tests as behavioral characterization.
- Build `LongFreePyramidFrameMachine` for rack history, rollover, balls remaining, score accumulation, winner determination, `awaiting-award`, and frame over.
- Implement `LongFreePyramidGameplaySession` and run the shared session contract plus long-specific scenarios.
- Remove the imperative long runtime and temporary parity harness after equivalence.

Exit criterion: long free pyramid has one authoritative resident machine-session implementation.

### Slice 4: Production sparring lifecycle model

- Rename/rebuild the prototype as `SparringMatchMachine`.
- Define stable phase/context projection and production lifecycle events.
- Initialize it directly from full `MatchConfig`; do not add an empty state.
- Include frame metadata, breaker policy, winner, and terminal semantics.
- Remove `match-point-reached` and separate `match.end`; a match-winning awarded frame transitions to terminal state.
- Rewrite machine topology tests.
- Do not wire MatchRoom yet.

Exit criterion: production lifecycle invariants exist in one XState machine, while the old reducer remains temporarily authoritative in MatchRoom.

### Slice 5: Sparring aggregate session, decision, and replay

- Add tagged active gameplay-session ownership to competition.
- Rename `ClientFact` to the match-fact vocabulary and remove unexplained client-origin metadata.
- Add creation, command parsing, decision, prepared transition, fact application, replay, and projection APIs.
- Add opaque `SparringMatchSession` over the match actor and selected gameplay session.
- Add competition decision, replay, equivalence, and control tests for every registered game.
- Keep temporary parity checks against the old reducer.

Exit criterion: competition can process and replay complete matches for every registered game without MatchRoom-specific helpers.

### Slice 6: Receipt outcome storage

- Change command receipt JSON to store accepted or rejected tagged outcomes.
- Rename accepted-fact references and stored-fact row codecs consistently.
- Remove `client_id` and `client_seq` from the unreleased MatchRoom schema unless a concrete producer requirement is established.
- Regenerate the unreleased initial MatchRoom migration.
- Add storage codec and corruption tests.
- Update RPC result schema/types.

Exit criterion: MatchRoom persistence can represent explicit rejection idempotently.

### Slice 7: MatchRoom production wiring

- Replace `RoomState` with resident `{ latestSeq, session }`.
- Replace `factsForCommand` with competition parsing/decision.
- Rename the inbound path to `submitMatchCommand` / `submitCommand`; reserve `decide` for domain policy and `apply` for committed facts.
- Enforce commit-before-apply.
- Replace `MatchRoom.apply` and `active-game.ts` domain logic with session replay/projection.
- Remove broad exception swallowing.
- Add warm/cold, receipt, replay, and finalization integration tests.

Exit criterion: all production MatchRoom commands and snapshots use the authoritative session.

### Slice 8: Remove parallel authority

- Remove old `MatchState`, reducer, and parity tests.
- Remove or reduce obsolete MatchRoom active-game helpers.
- Update completed snapshot archival to use competition replay/projection.
- Reshape root competition exports around the production API.
- Rename machine package subpath.
- Update the explorer.
- Update architecture notes to describe implemented rather than target behavior.

Exit criterion: no production or test path treats the old reducer as behavioral authority.

### Slice 9: Follow-up command typing

This is the next recorded P1 task, not required to claim the machine wiring complete:

- expose game-specific command parsers through gameplay registry/runtime,
- replace nested `commandType: string` plus generic payload in competition decisions,
- make gameplay parse failure and legal-state rejection distinct,
- tighten rejection reason types.

## Verification Per Slice

Run the narrow affected tests while implementing, then run:

```text
bun run check
```

before committing each slice.

For the MatchRoom wiring slice, also run the MatchRoom-specific typecheck/build if integration tooling changes generated bindings:

```text
bun run --cwd do/match-room typecheck
bun run --cwd do/match-room build
```

The full gate remains the source of truth.

## Acceptance Criteria

The task is complete when:

- `StrilaFrameMachine` is the only implementation of Strila frame transitions,
- one configured `PyramidFrameMachine` is the only implementation of regular pyramid variant transitions,
- `LongFreePyramidFrameMachine` is the only implementation of long free pyramid frame transitions,
- `SparringMatchMachine` is the only implementation of sparring lifecycle transitions,
- MatchRoom stores a package-owned resident session while alive,
- cold replay reconstructs the same match and active gameplay-session state as warm incremental application,
- MatchRoom never mutates resident authority before SQLite commits,
- accepted commands produce semantic fact drafts and committed facts,
- expected rejection is explicit and idempotent,
- defects are not converted into empty success,
- snapshots and controls derive from authoritative session state,
- completed archives derive terminal snapshots from the same replay path,
- every registered game passes representative match integration coverage,
- the old `MatchState` reducer and duplicate MatchRoom rule code are removed,
- the explorer inspects the production machine,
- raw XState snapshots are not persisted or exposed as the production MatchRoom contract,
- every active frame uses one resident gameplay machine session and reuses its actor state across warm commands,
- fact names no longer imply that browsers author accepted facts,
- `bun run check` passes.

## Deferred Decisions

Record but do not solve these inside the P0 wiring unless implementation evidence requires them:

- expected observed match sequence and optimistic concurrency policy,
- gameplay rules versioning across active-match deployments,
- domain checkpoints for long journals,
- frame reopen and undo facts,
- tournament match composition,
- direct WebSocket gateway and hibernation,
- whether a second match format justifies shared generic match machinery.
