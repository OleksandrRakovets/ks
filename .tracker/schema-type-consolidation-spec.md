# Schema and Type Consolidation Specification

## Status and Scope

Planned refactor. This specification covers schema and type cleanup along the existing dependency direction:

```text
core <- gameplay <- competition
       \          \
        \          -> MatchRoom
         -> competition -> application -> Play
```

The refactor makes canonical meanings flow upward without being restated as weaker local types. Existing storage, RPC, HTTP, and browser persistence seams remain in place. No new package, generic repository, schema layer, or compatibility abstraction is introduced.

This work includes:

1. self-contained MatchRoom fact rows and one whole-row storage codec;
2. semantic D1 protocol archive records;
3. just-in-time adoption of canonical inferred types;
4. composition of competition match state from core schemas;
5. one composed match-creation definition;
6. corrected ownership of match targets and registered game keys.

Gameplay projection return typing is deliberately excluded. It requires a separate design decision about whether the gameplay interface should expose a generic discriminated projection, projection-key overloads, or game-specific registry types.

## Design Rules

### Construct valid values once

Code owned by this repository should construct values through canonical typed functions and schemas rather than pass `unknown` through several layers and increase the number of rejection sites. Parsing belongs where the representation or trust level actually changes:

- HTTP forms, browser storage, database rows, and decoded JSON;
- independently serialized runtime messages when static typing cannot establish their shape;
- restoration of persisted machine state.

Do not reparse a value merely because it crossed an internal function call with a canonical output type. Do not widen a canonical type to `string`, `number`, or `unknown` and then parse it back later.

### Schemas parse recursively

Valibot object schemas recursively parse their field schemas. JSON-backed fields should therefore decode inside the whole-row schema:

```ts
payloadJson: v.pipe(v.string(), v.parseJson())
```

A following transform may rename the decoded field, and a following canonical schema may recursively validate its semantic contents. Do not perform a preliminary JSON `safeParse`, manually reconstruct every semantic key, and then parse the reconstructed object.

### Keep persistence schemas private

Core owns `StoredFactSchema`; it must not learn about `payload_json`, Drizzle, D1, or Durable Object SQLite. MatchRoom owns the private mapping between an accepted-fact row and `StoredFact`. Application owns the private mapping between D1 archive columns and a completed archive value.

### Export types only when adopted

Do not add speculative exports. When a current consumer needs the output type of an existing canonical schema:

1. add the inferred type beside its schema;
2. switch every known duplicate consumer in the same slice;
3. re-export that canonical type from an owning public contract when useful for discoverability;
4. delete the local structural copies.

A package may re-export a deeper type as part of its own interface, but must not recreate the same structure under a new declaration. Local construction and presentation types remain local when they represent a genuinely different meaning.

## Slice 1: Self-Contained MatchRoom Fact Rows

### Storage shape

Add `match_id TEXT NOT NULL` to `accepted_facts` in `do/match-room/src/storage/schema.ts`. Reference `active_matches.match_id` so SQLite prevents an accepted fact from naming a nonexistent active match. Continue using `seq` as the per-object primary key and `fact_id` as a unique domain identifier.

Every inserted row must come from an already-valid `StoredFact`. Persist `fact.matchId`; do not recover it later from `ActiveMatchStore.match()`. The MatchRoom object still owns exactly one match, but each fact row becomes a self-describing persisted representation of the complete fact envelope.

Because MatchRoom has never been deployed, regenerate and review the current schema into the single initial SQLite migration and bundle it in `do/match-room/drizzle/migrations.js`. Unreleased schema changes belong in that baseline; do not add compatibility migrations.

### Whole-row codec

Define one private schema or parser in MatchRoom storage that:

1. accepts the complete selected `accepted_facts` row;
2. validates scalar columns with canonical core schemas where available;
3. decodes `payloadJson` with `v.pipe(v.string(), v.parseJson())` as a field of that row;
4. transforms `{ payloadJson, ...row }` to `{ payload: payloadJson, ...row }`;
5. pipes the transformed value through `StoredFactSchema`.

The read path should conceptually reduce to:

```ts
return rows.map((row) => v.parse(StoredFactRowSchema, row))
```

The exact storage columns are listed once in the private codec. Callers must not enumerate the semantic fact keys or inject `matchId`.

Persisted corruption is exceptional. `factsAfter()` must not silently omit a malformed row and return an incomplete replay. Parsing failure should fail the operation with enough context to identify MatchRoom storage corruption, without logging fact payload contents or secrets.

### Accepted fact type

In the same slice, export `AcceptedFact = v.InferOutput<typeof AcceptedFactSchema>` from core because it has immediate consumers. Replace the weaker `{ seq: number; factId: string }` declarations in MatchRoom storage and application command results. Preserve `PositiveIntegerSchema` and `FactIdSchema` evidence through those interfaces.

### Verification

- A committed fact round-trips through the private row codec as the same `StoredFact`, including `matchId`.
- Invalid JSON, an invalid discriminator/payload pair, or an invalid scalar fails decode instead of dropping a row.
- SQLite rejects a fact whose `match_id` has no corresponding active match.
- Existing receipt idempotency and sequence ordering remain unchanged.
- The initial migration is bundled and applied by MatchRoom's runtime migrator.

## Slice 2: Semantic D1 Protocol Archives

Move archive JSON decoding from `packages/application/src/use-cases.ts` into `packages/application/src/d1/protocol-archives.ts`.

Define one private whole-row schema that decodes and validates:

- `sourceLatestSeq` with the canonical sequence constraint;
- `protocolVersion` against the supported archive version;
- `rowsJson` through `v.parseJson()` and `ProtocolArchiveRowsSchema`;
- `snapshotJson` through `v.parseJson()` and `MatchSnapshotSchema`.

Transform the selected D1 row into a semantic record containing `rows` and `snapshot`, not `rowsJson` and `snapshotJson`. The application dependency and use cases must not expose JSON column names or import Valibot solely to decode archive storage.

The adapter should also enforce invariants that belong to the completed archive representation:

- `snapshot.latestSeq === sourceLatestSeq`;
- the snapshot is finished;
- the snapshot match ID equals the requested archive match ID.

Unsupported protocol versions remain an explicit application error. Do not introduce a compatibility decoder without a persisted older version that must be supported.

### Verification

- Completed protocol and snapshot reads return semantic values without use-case parsing.
- Malformed JSON and cross-column inconsistencies fail as archive corruption.
- Active protocol derivation and completed protocol rendering remain behaviorally unchanged.
- Archive write idempotency remains a persistence concern and is not replaced by schema parsing.

## Slice 3: Just-in-Time Canonical Type Adoption

Export inferred core types only while replacing their current duplicates:

- `HydratedMatchParticipant` from `HydratedMatchParticipantSchema`;
- `HydratedMatchParticipants` from `HydratedMatchParticipantsSchema`;
- `AcceptedFact` from `AcceptedFactSchema`, if not completed in Slice 1.

Replace the structural hydrated-participant declarations in `packages/application/src/contracts.ts` and Play renderer contracts. Application may re-export the core types from its public contract so callers naturally discover the application result shape, but it must not redeclare their fields.

Preserve existing canonical branded types in internal interfaces where their schemas already establish the meaning:

- `MatchId` instead of `string`;
- `PlayerRef` instead of `string`;
- `FactId` instead of `string`;
- `GameKey` or `RegisteredGameKey` instead of an unqualified `string`, according to the invariant required;
- `UnixEpochMilliseconds` instead of an unrestricted `number`.

Do not add schemas for purely internal values that never cross a representation seam. Types such as application presentation rows and private construction drafts remain ordinary derived TypeScript types.

### Verification

- Repository search finds no local hydrated-participant or accepted-fact structural duplicate.
- Application and MatchRoom contracts retain branded domain meanings instead of widening and reparsing them.
- No new inferred type export exists without a consumer introduced in the same slice.

## Slice 4: Compose Competition Match State

Replace `MatchStateFrameSchema` in `packages/competition/src/match-state.ts` with core's `FrameStateSchema`. Infer `MatchState` from `MatchStateSchema` rather than manually repeating its fields.

Keep `MatchStateSchema` in competition because `empty | active | finished`, optional pre-creation configuration, and aggregate frame history are competition meanings. Core continues to own the reusable frame value.

Choose one explicit role for `MatchStateSchema`:

- use it at the aggregate restoration/test seam and retain it as authoritative; or
- if no runtime restoration accepts unknown state, use it as the source of the inferred type and as a development/test assertion only.

Do not add routine parsing to `applyMatchFact()` or other typed aggregate operations.

### Verification

- `MatchState` is inferred from its schema.
- Competition contains no second declaration of core `FrameState`.
- Match replay and snapshot derivation tests remain unchanged in behavior.

## Slice 5: Compose Match Creation Once

Refactor competition match creation into reusable schema composition without duplicating its domain fields in MatchRoom.

Competition must remain the canonical owner of:

- registered game selection;
- positive match targets;
- first breaker seat;
- game configuration compatibility;
- exactly one participant for each seat.

Expose a composable match-request object schema plus a canonical validation pipeline when necessary. MatchRoom's private RPC create schema should add only runtime envelope fields:

- `matchId`;
- `controlSecret`;
- `createdAt`.

MatchRoom should parse the composed create body once. It must not first parse a weaker copy and then parse the overlapping fields again with `CreateMatchRequestSchema`.

Application has a different creation input because it receives player names rather than participant refs. Add an application-owned input schema that reuses competition fields and owns display-name normalization. Validate this input before creating guest players or recording a `creating` match. After player refs are resolved, construct the canonical competition request without reparsing values that are already typed.

Keep route responsibilities limited to FormData extraction, HTTP error adaptation, cookies, and redirects. The route may invoke the application input schema but must not become the durable owner of display-name identity rules.

### Verification

- Match creation domain fields are declared once in competition.
- MatchRoom validates one composed RPC body rather than two overlapping schemas.
- Invalid application creation input causes no player or match-catalog writes.
- Existing duplicate-create idempotency remains unchanged.

## Slice 6: Target and Game-Key Ownership

### Positive match targets

Keep `BySeatNumberSchema` general because score values may legitimately be negative. Strengthen core's `MatchTargetsSchema` by composing a positive-integer value for each seat. Competition's creation schema must reuse `MatchTargetsSchema` instead of repeating its shape.

This makes a non-positive target impossible to represent as `MatchTargets` while preserving signed scores elsewhere.

### Registered game keys

Core continues to own `GameKeySchema`, which establishes the durable syntactic representation and supports historical keys in stored facts and snapshots.

Gameplay owns a canonical `RegisteredGameKeySchema`, derived from the registry, for operations that require a runtime implementation. Export it with `RegisteredGameKey` when it gains its immediate competition consumer. Competition's match-creation schema must compose this schema directly rather than parse a non-empty string and call a separate registry predicate.

Keep `isRegisteredGameKey` only where boolean narrowing without error construction is useful, such as presentation fallback for historical catalog records. `parseGameKey()` should use the registered schema as its single source of validation.

### Game-specific configuration

Do not move `rackRollover` during this refactor. Its current placement in core is questionable because only long free pyramid understands it, but changing the generic match configuration representation affects facts, snapshots, competition creation, gameplay runtime construction, forms, and archived data. Record that as a separate design decision if additional game-specific configuration appears or before changing the persisted representation.

### Verification

- `MatchTargetsSchema` rejects zero and negative frame targets.
- Signed `BySeatNumber` scores remain supported.
- Competition contains no repeated target object schema.
- Registered-game validation has one gameplay-owned schema.
- Historical syntactically valid game keys remain readable even when no runtime is registered.

## Final Cleanup and Gate

After all slices:

- remove superseded local schemas, manual structural types, JSON parsing helpers, and imports;
- search for remaining widened copies of the consolidated meanings;
- update focused tests as each seam changes;
- run `bun run check`;
- run `bun run build` because MatchRoom storage migrations and cross-worker type contracts are affected.

The completed refactor should reduce schema declarations and parse sites. Any new parse must correspond to a named representation seam and replace weaker procedural checks rather than supplement them.

## Completion Criteria

- MatchRoom fact rows contain `matchId` and parse as a whole into `StoredFact`.
- No malformed persisted fact can be silently omitted from replay.
- D1 archive adapters return decoded semantic records.
- Current hydrated-participant and accepted-fact duplicates use just-in-time canonical inferred types.
- Competition state composes core frame state and is inferred from its schema.
- Match creation has one competition-owned semantic definition and one composed MatchRoom envelope.
- Match targets are positive by construction, while score values remain signed.
- Registered runtime game keys are validated by one gameplay-owned schema.
- No gameplay projection interface change is included in this work.
