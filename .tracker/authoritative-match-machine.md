# Authoritative Match Machine

## Status

This note records the intended domain architecture and the implementation slices to reach it. Read the relevant slice again before implementing it. The current production behavior does not yet match this target.

The highest-priority correction is to make the XState match machine the sole behavioral authority for match lifecycle. Command parsing, explicit rejection, MatchRoom integration tests, and public API cleanup follow from that correction.

Play remains intentionally outside this work. Its routes and UI are due for a separate redesign and deduplication. Browser end-to-end tests should be added after that surface stabilizes and should run in a separate confidence command rather than the fast `bun run check` gate.

## Design Goal

Each inner module should accept canonical domain values, represent legal states precisely, distinguish expected rejection from defects, and expose the smallest useful interface.

Apply that goal selectively. This work does not call for Effect, a new result package, a universal application error hierarchy, repository-per-table layers, a shared test-utils package, or a broad rewrite.

## Current Strengths

Commit `f7887d0` established several foundations this design should retain:

- IDs, player references, and registered game keys cross inner boundaries as domain types rather than raw strings.
- Match creation is parsed and normalized before side effects.
- Positive match targets are distinct from signed scores.
- D1 protocol archives are decoded and checked at the persistence boundary.
- MatchRoom fails closed on malformed persisted facts and receipts rather than silently dropping them.
- Stored facts enforce agreement between the envelope and `match.created` payload identity.
- Targeted safety comments explain casts that TypeScript cannot express.
- Focused tests cover core invariants and persistence representation decoding.

## Two Kinds Of Authority

"Authoritative" has two relevant meanings:

- **Behavioral authority:** decides whether a transition is legal and what state results.
- **Persistence authority:** provides the durable data from which current state can be reconstructed.

The intended architecture is:

- the XState match machine is the behavioral authority,
- accepted facts in MatchRoom SQLite are the persistence authority,
- replaying accepted facts drives the XState machine back to its current snapshot,
- no separate reducer independently implements match lifecycle rules.

This is internally consistent. A machine can own transition semantics while an event journal remains the durable source from which the machine is restored.

### Current mismatch

Production currently reconstructs state through `applyMatchFact` in `packages/competition/src/match-state.ts`. MatchRoom also calculates command legality in `do/match-room/src/MatchRoom.ts`. The XState machine in `packages/competition/src/match-sparring-machine.ts` is used primarily by tests and the machine explorer.

Consequently, the reducer and MatchRoom are the effective production state machine, while the machine intended to be authoritative is a parallel model. This split explains why fact handling currently appears to contain more domain behavior than expected.

## What Facts Mean

Separate the storage representation from the decoded domain event:

```text
accepted_facts SQL row
  -> decode StoredFact
  -> apply accepted domain event to XState machine
  -> reconstruct current machine snapshot
```

The SQL row is shallow infrastructure. The decoded fact has durable domain meaning: a match was created, a frame started, a game command was accepted, a frame completed, or a match ended.

Facts currently support:

- state reconstruction,
- command receipt idempotency,
- live event delivery,
- protocol generation,
- terminal archival.

The problem is not that facts have meaning. Event-sourced facts necessarily describe what happened. The problem is that `applyMatchFact` currently acts as an independent behavioral model.

The target flow is:

```text
parsed command
  -> decide against current XState snapshot
  -> accepted facts or explicit rejection
  -> persist accepted facts and command receipt
  -> evolve XState snapshot by applying accepted facts
```

Restoration uses the same transition semantics:

```text
persisted facts
  -> decode and parse
  -> apply each fact to the XState machine
  -> reconstructed snapshot
```

Replay must be deterministic. It must not generate new IDs, read ambient time, or emit duplicate effects.

## Separate Vocabularies

Do not collapse commands and facts merely because XState calls its inputs events.

### Commands

Commands express requested intent. Match commands include concepts such as:

```ts
type MatchCommand =
  | { readonly type: 'frame.start' }
  | { readonly type: 'frame.commence'; readonly seat: Seat }
  | { readonly type: 'frame.concede'; readonly seat: Seat }
  | { readonly type: 'match.end' }
```

Game commands remain game-specific and are selected through the gameplay registry.

### Facts

Facts express accepted outcomes. They include concepts such as:

```ts
type MatchFact = MatchCreatedFact | FrameStartedFact | FrameCompletedFact | MatchEndedFact
```

Only accepted outcomes belong in the fact journal. Rejected caller intent does not become a match fact.

### Machine state

The authoritative machine owns:

- lifecycle phase,
- match configuration,
- current frame metadata,
- completed frames,
- frame wins,
- terminal winner,
- legal match transitions.

Use XState state and context as this representation rather than introducing another parallel `MatchState` model.

## P0: Authoritative XState Match Machine

The existing `matchSparringMachine` cannot simply replace `MatchState`. It does not yet model all production concepts, including:

- match ID,
- game key,
- first breaker and breaker alternation,
- game configuration,
- active frame metadata,
- frame commencement,
- concessions,
- complete public snapshot projection,
- restoration from persisted facts,
- production-grade parsed input,
- explicit transition rejection.

Its current event vocabulary also mixes requested actions and accepted outcomes. Design the production machine API before replacing callers.

### Desired aggregate interface

The exact names are open, but the aggregate needs two distinct operations:

```ts
type MatchDecision =
  | {
      readonly _tag: 'accepted'
      readonly facts: ReadonlyArray<ClientFact>
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: MatchCommandRejection
    }

function decideMatchCommand(
  snapshot: MatchMachineSnapshot,
  command: ParsedMatchCommand,
  environment: DecisionEnvironment,
): MatchDecision

function applyMatchFact(snapshot: MatchMachineSnapshot, fact: ClientFact): MatchMachineSnapshot
```

Required properties:

- both operations use the same production XState machine,
- decision logic does not recreate lifecycle guards outside the machine,
- replay cannot emit new IDs, timestamps, broadcasts, or writes,
- generated IDs and time needed for new facts are supplied explicitly,
- facts are persisted only after an accepted decision,
- persisted facts deterministically reproduce the accepted state.

The final interface may use actor-independent XState transition APIs rather than the illustrative functions above. Avoid hiding mutable actors or ambient dependencies inside the domain package.

### Migration slices

1. Specify the production match lifecycle and invariants currently distributed across `match-state.ts`, `MatchRoom.ts`, `control.ts`, and `match-sparring-machine.ts`.
2. Expand or replace `matchSparringMachine` with a production-named machine and production types.
3. Add deterministic fact-to-machine-event translation.
4. Prove that replaying existing accepted fact sequences produces the expected machine snapshot.
5. Move match command legality from MatchRoom into the machine-facing decision operation.
6. Derive public match snapshots and match controls from the machine snapshot.
7. Move MatchRoom reconstruction and command handling to the production machine.
8. Remove the superseded `MatchState` and independent `applyMatchFact` behavior.
9. Point the machine explorer at the same production machine.

During migration, a temporary parity test can assert that the old reducer projection and new machine projection agree for representative fact sequences. Remove the old reducer and parity harness once the production switch is complete; do not retain two authorities for permanent compatibility.

## P1: Parse Commands Before Applying Rules

Keep one shared `game.command` fact path and one shared RPC command envelope. The problem is that gameplay currently receives a broad `commandType: string` plus generic object payload.

The target path is:

```text
RPC input
  -> parse common ControlCommand envelope
  -> inspect command source
  -> parse a MatchCommand or selected game-specific command union
  -> ask the authoritative machine/runtime for a decision
```

For game commands:

```text
RegisteredGameKey
  -> select gameplay command parser
  -> parsed command for that game
  -> apply gameplay transition
```

This preserves the registry, shared transport, and common fact path while preventing raw string-and-object commands from entering gameplay rules.

Parsing and decision have different meanings:

- an unknown type or malformed payload is a boundary parsing failure,
- a parsed command that is illegal in current state is an expected rejection,
- an impossible machine/runtime condition is a defect.

## P1: Explicit Command Rejection

The UI should only present commands valid for the state it has observed. That prevents predictable invalid actions and remains important for usability.

It cannot guarantee validity at the authoritative boundary because observed client state can become stale. A normal race is:

1. Clients A and B both observe sequence 20.
2. Both correctly render an action valid at sequence 20.
3. Client A submits first and MatchRoom advances to sequence 21.
4. Client B submits the action it was correctly shown, but it is no longer legal.

Other ordinary causes include:

- dropped or delayed live messages,
- sleeping mobile tabs,
- reconnecting before catch-up completes,
- double taps with different command IDs,
- multiple operators,
- reordered requests,
- old deployed clients,
- retries after surrounding state changed,
- direct requests that bypass the UI.

Therefore:

> UI correctness prevents locally predictable invalid actions. Server rejection handles the unavoidable gap between observed and authoritative state.

Rejection is a normal command decision, not necessarily an exceptional error:

```ts
type CommandResult =
  | { readonly _tag: 'accepted'; readonly accepted: ReadonlyArray<AcceptedFact> }
  | {
      readonly _tag: 'rejected'
      readonly reason: 'stale-state' | 'illegal-transition' | 'invalid-command'
    }
```

The final reasons should be derived from actual recovery behavior rather than copied from this example.

### Expected sequence

Consider adding the client's observed sequence to command requests:

```ts
{
  commandId,
  expectedLatestSeq: 20,
  command,
}
```

This can distinguish stale observation from semantic rejection and give the client the current sequence for recovery. It is optional because the machine must still validate every transition.

The mechanisms solve different problems:

- `commandId` provides request idempotency,
- `expectedLatestSeq` detects optimistic concurrency,
- the machine determines semantic legality.

Do not assume every sequence mismatch must reject. A future command could remain legal after an unrelated intervening fact. Decide this policy per command semantics.

### Failure classification

Keep these outcomes distinct:

| Outcome              | Meaning                                            | Example                                 |
| -------------------- | -------------------------------------------------- | --------------------------------------- |
| Parsing failure      | Request is not a known command                     | malformed payload or wrong game command |
| Expected rejection   | Parsed command cannot apply to current state       | start a frame while one is active       |
| Idempotency conflict | Command ID was used with another request           | same ID, different body                 |
| Defect               | Internal invariant or authoritative data is broken | accepted fact cannot be replayed        |

MatchRoom currently catches every exception from command interpretation and commits a successful empty receipt. Remove that behavior after explicit command decisions exist. Defects and storage corruption must remain visible rather than becoming ordinary rejection.

For idempotency, decide and test whether rejected commands receive durable receipts. If they do, replaying the same command ID and request must return the same rejection result.

## P1: MatchRoom Integration Confidence

Pure decoder tests are useful but do not prove Durable Object SQLite transactions, reconstruction, and RPC behavior agree.

Add focused MatchRoom integration tests through the actual Durable Object methods and storage seam where the Cloudflare test environment permits:

1. create a room and read its initial snapshot,
2. apply a command and verify persisted facts and derived snapshot,
3. repeat the same command ID and request,
4. repeat the same command ID with a conflicting request,
5. reinstantiate or reload and verify fact replay reconstructs the machine,
6. verify an expected rejected command is distinct from a defect,
7. end a match and verify finalizing lock behavior,
8. read finalization data, dispose storage, and reject later access,
9. verify malformed authoritative persisted data fails closed,
10. verify live replay from a sequence when practical at this layer.

The key invariant is:

```text
accepted decision
  == persisted facts
  == replayed machine snapshot
  == exposed room projection
```

## P2: D1 Integration Confidence

Use a migrated local test database rather than mocked Drizzle chains for behavior where SQL, constraints, or transactions matter.

Cover:

1. creating to active lifecycle,
2. active to finalizing to finished lifecycle,
3. protocol archive write/read round trip,
4. completed snapshot and source-sequence consistency,
5. uniqueness and retry behavior,
6. forbidden lifecycle regressions,
7. guest-player normalization where database behavior matters.

The application unit suite should continue to test orchestration and failure convergence through narrow dependencies. Integration tests complement rather than replace those tests.

## P2: Application Failure Contracts

Application failures currently combine application meaning, human text, and HTTP status in shapes such as:

```ts
{
  ok: false
  error: string
  status: number
}
```

Move gradually toward stable, use-case-specific failure codes:

```ts
type ReadMatchFailure =
  | { readonly ok: false; readonly code: 'match-not-found' }
  | { readonly ok: false; readonly code: 'archive-missing' }
  | { readonly ok: false; readonly code: 'archive-corrupt' }
  | { readonly ok: false; readonly code: 'game-key-mismatch' }
```

Play can translate these into HTTP status, localization, redirects, or concealment behavior.

Constraints:

- do not introduce one universal `AppError`,
- define precise failures per use case or cohesive capability,
- keep infrastructure causes and provider details private,
- migrate contracts when affected behavior is already being revised,
- do not perform an unrelated application-wide rewrite.

## Test Growth Policy

The concern is confidence allocation, not the raw test-to-production ratio. Gameplay and competition already have substantial pure coverage. The larger risks are real persistence and runtime seams.

Continue focused pure tests for:

- legal and illegal machine transitions,
- fact replay,
- parsed game commands,
- projections,
- serialization round trips,
- representative complete game scenarios.

Use exact equality for public serialized facts, records, archives, and RPC responses. Prefer focused invariant assertions for long scenarios and private machine representation.

`packages/application/src/use-cases.test.ts` is a maintenance hotspot. When application behavior next changes:

- split tests by capability,
- add a package-local dependency builder,
- make dependencies fail by default,
- override only operations expected by each test.

Do not create a monorepo-wide test support package. Grow helpers from test-local to feature-local to package-local; share only after two real stable consumers emerge.

Property testing may later help replay equivalence, parser/serializer round trips, frame sequence invariants, receipt idempotency, or normalization idempotence. Do not add `fast-check` until a concrete property replaces meaningful example duplication.

## Package Surface

`@ks/core` is intentionally a prelude-like package containing the lowest common shared schemas, types, and pure helpers. Its broad facade is deliberate; no export restructuring is required merely because it uses wildcard re-exports.

`@ks/i18n` is currently a very small shared surface. Do not move or restructure it without evidence from actual consumers and dependency direction.

The issue in `@ks/competition` is different: its current exports communicate the wrong behavioral authority. The root exposes `MatchState`, `applyMatchFact`, snapshot derivation, and control derivation, while the intended authoritative machine is isolated under the `match-sparring-machine` subpath and named as an experiment.

After the P0 refactor, shape the competition public interface around the production machine. Likely public concepts include:

- parsed match commands,
- match decision and rejection types,
- production machine snapshot or stable domain projection,
- deterministic fact replay,
- match creation types and constructors,
- control projection derived from the production machine.

Stop exporting the superseded parallel reducer, migration adapters, and unnecessary XState internals. Whether the final entrypoint uses explicit exports or reviewed wildcard exports is secondary to exposing one clear authority.

## Documentation Policy

Require JSDoc for:

- package-entrypoint public contracts,
- important domain types and their invariants,
- public methods of important exported classes,
- MatchRoom RPC methods and behavioral guarantees,
- parsers and smart constructors with non-obvious normalization,
- custom corruption/defect errors,
- unusual lifecycle transitions,
- safety-sensitive APIs where TypeScript cannot express the invariant.

JSDoc remains optional for obvious schema constants, implementation exports outside package entrypoints, self-explanatory inferred types, trivial fields, and private helpers.

Documentation should explain meaning, construction, guarantees, expected failures, and effects. It should not narrate syntax.

## Explicit Non-Goals

- Do not add Effect.
- Do not add a result package until local tagged unions prove inadequate.
- Do not introduce a universal application error type.
- Do not create repository-per-table abstractions.
- Do not create adapters that only forward an identical internal call.
- Do not add a shared test-utils package without multiple stable consumers.
- Do not add property testing without a concrete valuable property.
- Do not require JSDoc for every implementation-level export.
- Do not preserve the old reducer as a permanent compatibility path.
- Do not add browser end-to-end tests before the Play redesign stabilizes.

## Priority Order

1. **P0:** make the XState match machine the sole behavioral authority.
2. **P1:** parse match and game-specific commands before transition logic.
3. **P1:** return explicit accepted/rejected command decisions and remove broad exception swallowing.
4. **P1:** add MatchRoom integration tests proving command, persistence, replay, and projection agree.
5. **P2:** add D1 lifecycle and archive integration tests.
6. **P2:** replace application error text/status contracts incrementally with stable use-case failure codes.
7. **P2:** reshape `@ks/competition` exports around the production machine.
8. **Later:** redesign Play, then add route tests and separate browser end-to-end confidence coverage.

Command parsing and rejection follow machine authority because the machine defines what a legal or rejected command means. MatchRoom integration coverage belongs in the same early sequence because it proves the new authority survives persistence and restoration rather than existing only in pure tests.
