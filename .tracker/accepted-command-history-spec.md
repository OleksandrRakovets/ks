# Accepted Command History Refactor

## Purpose

Replace the active `Fact` model with one ordered Accepted Command record per successful command. Each Accepted Command owns the game-specific Protocol entries produced by that command. Persist Final Match State atomically when the match ends, then transfer Protocol and Final Match State from MatchRoom SQLite to D1 without replaying gameplay in the application Worker.

Read `CONTEXT.md` first. Its language is authoritative:

- a Command is submitted intent and may be rejected;
- an Accepted Command changed the recorded match;
- a Protocol Entry is a game-specific official record produced by an Accepted Command;
- Protocol is the official chronological record;
- Final Match State is the terminal completed representation;
- framework events and snapshots remain XState terminology;
- do not introduce `Fact`, `Domain Event`, `Journal`, or `Catalog` as KS concepts.

The project has not been deployed. Replace the clean baseline directly. Do not add compatibility readers, migrations for old local data, dual-write paths, or legacy unions. Do not hand-format generated Drizzle migrations or generated Worker types.

Complete `.tracker/gameplay-corrections-spec.md` first. This refactor assumes its corrected terminology, command payloads, and regression coverage. Do not combine those behavioral changes with the persistence refactor.

## Current Design And Problem

The current implementation spreads one accepted command across several representations:

- `command_receipts.requestJson` stores the submitted command;
- `accepted_facts` stores lifecycle facts and `game.command` facts;
- each `game.command` fact embeds the command payload again;
- the same fact embeds one or more precomputed `protocolEntries`;
- restoration reconstructs commands from facts and re-executes them;
- MatchRoom finalization may replay facts to recover resident state;
- application finalization always replays the complete fact history again before writing D1.

Relevant code:

- `packages/core/src/facts.ts`
- `packages/competition/src/sparring-match.ts`
- `do/match-room/src/storage/schema.ts`
- `do/match-room/src/MatchRoom.ts`
- `packages/application/src/d1/completed-matches.ts`
- `packages/application/src/protocol.ts`

This creates an unnecessary `Fact` entity, duplicates command data, makes presentation entries look authoritative only because they are nested in facts, and turns finalization into another domain execution instead of a durable transfer.

## Target Authority Model

### Active match

MatchRoom SQLite owns:

- match configuration and lifecycle status;
- ordered Accepted Commands;
- each Accepted Command's Protocol entries;
- command outcomes needed for idempotency;
- the monotonic accepted-command sequence;
- Final Match State only after terminal command acceptance.

Accepted Commands are the replay authority while a match is active. Protocol entries are the official chronological record, computed and persisted atomically with command acceptance.

### Finalizing match

The terminal command transaction atomically persists:

- the terminal Accepted Command;
- its Protocol entries;
- Final Match State;
- authoritative `endedAt`;
- MatchRoom status `finalizing`.

Once this commits, MatchRoom does not need resident gameplay state to finalize.

### Finished match

D1 owns:

- the `matches` row and finished status;
- archived Protocol rows;
- Final Match State.

Application validates the MatchRoom RPC representation and copies it idempotently to D1. It must not replay commands or execute gameplay during this transfer. After archival, application asks MatchRoom to broadcast terminal completion, close live connections, and delete local storage, then marks the D1 match row finished.

## Frame Vocabulary

Apply these names consistently in commands, Protocol entries, UI control descriptors, tests, and copy:

| Intent | Command |
| --- | --- |
| Prepare the next frame | `frame.prepare` |
| Begin play in the prepared frame | `frame.commence` |
| Formally assign the frame to its winner | `frame.award` |

Rename current `frame.start` to `frame.prepare`. Retain `frame.commence` and `frame.award`. Do not replace commence with start or award with close.

Protocol entries should describe the accepted real-world record using game-owned structured bodies. They do not need a parallel past-tense fact type merely to state that the command was accepted.

## Active Storage

Replace `accepted_facts` and the current receipt representation with two normalized tables:

- `commands` represents every submitted command and its accepted or rejected outcome;
- `protocol_entries` contains one row per official entry produced by an Accepted Command.

Do not add a repository or collection abstraction merely for naming.

The table must support this logical shape:

```ts
type StoredCommand = {
  commandId: CommandId
  matchId: MatchId
  requestJson: string
  outcome: 'accepted' | 'rejected'
  acceptedSeq?: number
  acceptedAt?: UnixEpochMilliseconds
  rejectionJson?: string
}

type StoredProtocolEntry = {
  acceptedSeq: number
  entryIndex: number
  causedByCommandId: CommandId
  acceptedAt: UnixEpochMilliseconds
  frameIndex?: number
  source: 'player' | 'system'
  entryType: string
  seat: Seat
  scoreAfter?: BySeatNumber
  bodyJson: string
}
```

Required constraints:

- `commandId` is unique;
- every row belongs to the named match;
- rejected command rows have a validated rejection and no accepted sequence or acceptance time;
- accepted command rows have a positive unique sequence and acceptance time;
- accepted sequences are contiguous and monotonic per MatchRoom;
- every accepted command owns one or more Protocol-entry rows;
- `(acceptedSeq, entryIndex)` uniquely and stably orders Protocol entries;
- every Protocol entry references its causing accepted command;
- every Protocol entry has a focal seat;
- a rejected command owns no Protocol entries;
- a retry with the same command ID and canonical request returns the stored outcome;
- reuse of a command ID with a different canonical request conflicts;
- rejection does not advance accepted sequence;
- an accepted command, its Protocol entries, latest sequence, and any terminal state/status change commit in one SQLite transaction.

The active Protocol tab must query `protocol_entries` directly in `(acceptedSeq, entryIndex)` order. It must not load command rows to concatenate embedded arrays. `bodyJson` remains appropriate for validated game-specific detail; scalar ordering, actor, frame, and score fields should remain directly queryable.

The physical schema may use explicit nullable columns plus checks or another equally small normalized representation, but it must not store command payload twice or retain `accepted_facts` alongside Accepted Commands.

An accepted receipt should identify the Accepted Command sequence rather than a list of fact IDs:

```ts
type CommandReceiptOutcome =
  | { _tag: 'accepted'; acceptedSeq: number }
  | { _tag: 'rejected'; reason: SparringMatchRejection }
```

Remove `FactId`, `AcceptedFactRef`, and fact-envelope causation if no other real consumer remains. `protocol_entries.causedByCommandId` is the explicit foreign-key causation link requested by the domain model.

## Command Execution

Keep command handling and Protocol computation in one request. This is intentional.

For a new command:

1. Parse and validate the command at the RPC boundary.
2. Check an existing row by command ID before resident restoration.
3. If a matching row exists, return its stored outcome.
4. Restore resident state from Accepted Commands only when the cache is absent or stale.
5. Execute the new command against gameplay.
6. On rejection, persist the rejected outcome without advancing sequence.
7. On acceptance, obtain the next gameplay state, one or more Protocol entries, and any terminal Final Match State.
8. Advance resident state speculatively.
9. Atomically persist the Accepted Command and all associated output.
10. If execution, encoding, or persistence fails, discard resident state so the next operation restores from durable Accepted Commands.
11. Broadcast live change only after commit.

Do not split a gameplay transition into a command-to-facts stage followed by a fact applier. The accepted command is sufficient replay input.

Every accepted command must produce at least one Protocol entry. If an operation appears to have no Protocol meaning, determine whether it is truly a match-changing command. Frame preparation, commencement, concession, award, automatic foul consequences, winner determination, and match completion all have Protocol meaning and can produce multiple entries where required.

## Protocol Entries

Gameplay continues to own game-specific Protocol-entry production because it has the previous state, command, next state, automatic rule consequences, and score transition together.

Retain the useful current execution shape:

```text
previous gameplay state + accepted command + next gameplay state
  -> one or more validated Protocol entries
```

Protocol entries must preserve:

- command actor/seat;
- frame index;
- potted-ball count for Pyramid or exact ball identities for Strila;
- score after the entry where currently displayed;
- manual and automatic foul distinctions;
- applied foul penalty;
- Strila foul-response selection;
- winner-determination detail already emitted by gameplay;
- respotted-black declaration;
- concession;
- frame preparation, commencement, and award;
- match completion.

`seat` is required for every Protocol entry. It means the seat most directly associated with the recorded item:

- for a player command, the acting player;
- for frame preparation, the breaker;
- for a foul, the offender;
- for penalty selection or an awarded penalty point, the chooser or beneficiary represented by that entry;
- for winner determination, award, or match end, the winner;
- for concession, the conceding player;
- for Strila respotted-black declaration, the player whose accepted pot produced the tie and caused the declaration.

Do not make `seat` nullable merely to distinguish player and system entries. `source` carries that distinction. If a future Protocol item has no meaningful focal seat, reconsider that concrete item and schema deliberately rather than pre-emptively weakening every row.

System-determined consequences may be additional Protocol entries owned by the same Accepted Command. This is the intended rare one-command-to-many-entry case.

Do not move game-specific Protocol semantics into `@ks/application`. Application may localize and adapt validated entries into display/archive rows, but gameplay determines their structured meaning.

At active reads and finalization, query entries directly in `(acceptedSeq, entryIndex)` order. Do not reconstruct Protocol by loading and concatenating per-command arrays.

## Restoration

Cold restoration is required only while a match is active. It must:

1. Load canonical match configuration.
2. Load accepted command rows ordered by `acceptedSeq`.
3. Decode and validate every command and Protocol-entry array at the storage boundary.
4. Re-execute each Accepted Command through the same aggregate operation used for warm execution.
5. Compare regenerated Protocol entries with persisted entries.
6. Reject malformed, impossible, reordered, incompatible, or semantically divergent history.
7. Produce resident state equal to warm execution.

Do not restore rejected commands. Do not reconstruct commands from Protocol entries. Do not create a second semantic history format.

The comparison protects an active match from storage corruption and execution/persistence defects. No legacy-rule versioning is required because the project has not been deployed and active histories are temporary.

## Terminal Persistence And Transfer

When an accepted command ends the match, derive Final Match State from the already updated resident aggregate and persist it in MatchRoom SQLite in the same transaction as the terminal Accepted Command.

Extend the active match storage record with terminal-only fields as needed, for example:

- `finalStateJson`, nullable while active and required while finalizing;
- `endedAt`, nullable while active and required while finalizing.

Storage decoding must enforce:

- active rows have no Final Match State or `endedAt`;
- finalizing rows have a schema-valid finished `MatchState` and `endedAt`;
- Final Match State identity and game key match the MatchRoom record;
- source latest sequence matches the terminal Accepted Command;
- terminal Protocol entries exist and describe completion.

Rewrite `MatchRoom.finalization()` to return only validated transfer data:

```ts
type CompletedMatchTransfer = {
  matchId: MatchId
  sourceLatestSeq: number
  endedAt: UnixEpochMilliseconds
  protocolEntries: StoredProtocolEntry[]
  finalState: MatchState
}
```

It must read SQLite and work after Durable Object eviction without restoring gameplay. Do not return the complete command history.

Rewrite application archival so it:

1. Validates the MatchRoom RPC result structurally.
2. Verifies match identity, game key, terminal state, sequence, timestamps, and Protocol entry ordering.
3. Adapts entries to the existing versioned D1 Protocol archive representation.
4. Idempotently writes Protocol and Final Match State.
5. Does not import or execute `restoreSparringMatch` in the D1 adapter.
6. Does not compare against a separately replayed projection.

Keep existing cross-store ordering:

```text
MatchRoom terminal transaction
  -> application copies Protocol + Final Match State to D1
  -> MatchRoom broadcasts terminal completion, closes live clients, deletes SQLite
  -> application marks D1 matches.status = finished
```

Archive failure leaves the complete finalizing transfer durable in MatchRoom for retry. Disposal and D1 finish remain idempotent.

## Live Delivery

Facts currently double as live invalidation messages. Replace that wire contract deliberately; do not expose submitted command payloads merely because Accepted Commands are now authoritative internally.

Use a small validated update DTO containing:

- latest accepted sequence;
- newly committed public Protocol entries or enough information to trigger revalidation;
- explicit terminal indication when archival is complete.

The browser currently treats most live records as revalidation signals and treats `match.ended` specially. Preserve those behaviors without retaining a fake domain fact. Terminal notification must remain withheld until D1 archival succeeds, then stop reconnection and permit finished reads from D1.

Do not implement the separate WebSocket design in `.tracker/match-live-websocket-spec.md` as part of this refactor.

## Behavioral Baseline

Treat gameplay behavior established by `.tracker/gameplay-corrections-spec.md` as fixed input. Persistence work must preserve it without opportunistic rule or vocabulary changes.

This refactor does not implement Undo. The ordered Accepted Command identity and retained request make future correction possible without deleting history.

## Primary Files And Removals

Expect changes in at least:

- `packages/core/src/facts.ts` and exports, likely deleting the fact model;
- `packages/core/src/ids.ts` if `FactId` becomes unused;
- `packages/core/src/wire.ts`;
- `packages/core/src/control.ts`;
- `packages/gameplay/src/gameplay-session.ts`;
- `packages/gameplay/src/command-schemas.ts`;
- `packages/gameplay/src/**/protocol.ts`;
- `packages/gameplay/src/**/definitions.ts`;
- `packages/competition/src/sparring-match.ts`;
- `do/match-room/src/storage/schema.ts`;
- `do/match-room/src/storage/active-match-store.ts`;
- `do/match-room/src/storage/command-receipt.ts`;
- `do/match-room/src/MatchRoom.ts`;
- `packages/application/src/match-room-client.ts`;
- `packages/application/src/protocol.ts`;
- `packages/application/src/d1/completed-matches.ts`;
- `packages/application/src/d1/protocol-archives.ts`;
- live browser parsing and fixtures under `apps/play/web/routes/match`;
- all corresponding unit and integration tests.

Remove obsolete concepts after migration:

- `MatchFact`, `StoredMatchFact`, and content batch/history types;
- `FactId` and fact references if unused;
- `accepted_facts`;
- `game.command` facts;
- fact envelope causation;
- command reconstruction from fact batches;
- application-side semantic replay during archival;
- Protocol adjacency workarounds caused by generic facts;
- fact-oriented i18n errors and live DTOs.

Use `grep` for `Fact`, `fact`, `journal`, `game.command`, `frame.start`, `frame.started`, `frame.completed`, `restoreSparringMatch`, and `ProtocolEntry` to find coupling. Keep legitimate Protocol Entry uses and active restoration; remove only obsolete fact and archive-replay uses.

Respect `core <- gameplay <- competition`. Core owns shared IDs, seats, command transport, Final Match State, and structural Protocol contracts that do not import registered games. Gameplay owns registered command parsing, game-specific Protocol semantics, and transitions. Competition owns match orchestration and active restoration. Application owns transfer validation, presentation adaptation, and D1 persistence.

## Implementation Order

1. Confirm `.tracker/gameplay-corrections-spec.md` is complete and all gates pass.
2. Introduce the accepted-command storage/RPC contracts and tests without adding another abstraction layer.
3. Change MatchRoom persistence from facts plus receipts to normalized command and Protocol-entry rows.
4. Restore active matches by replaying accepted rows and comparing Protocol entries.
5. Persist terminal Final Match State and `endedAt` atomically.
6. Change MatchRoom finalization to return transfer data without replay.
7. Remove application-side replay and archive directly from validated transfer data.
8. Replace fact-based live messages with the narrow update DTO.
9. Remove fact types, codecs, tables, tests, and residual terminology.
10. Update `.tracker/decisions/current-architecture.md`, `AGENTS.md`, and `.tracker/db.md` to describe the implemented authority model.

Do not leave a mixed active authority where some commands restore from facts and others from accepted-command rows. Small reviewable intermediate commits are welcome, but the final branch must have one model.

## Acceptance Criteria

- No KS entity or active storage table is named Fact or Journal.
- One stored command row contains the canonical request and outcome without duplicating the payload.
- Protocol has one independently queryable row per entry, ordered by `(acceptedSeq, entryIndex)` and linked by `causedByCommandId`.
- Command payload is not duplicated across receipt and history storage.
- Every accepted command produces a nonempty Protocol-entry array atomically.
- Rejected commands remain idempotent and do not advance accepted sequence.
- Active cold restoration replays Accepted Commands and validates regenerated Protocol entries.
- Warm and restored projections agree for every registered game.
- Terminal command acceptance atomically stores Final Match State, `endedAt`, latest sequence, Protocol entries, and `finalizing` status.
- MatchRoom finalization works from SQLite after resident eviction without gameplay replay.
- Application archival performs no command or gameplay replay.
- MatchRoom finalization RPC does not send Accepted Command history to application.
- D1 receives validated Protocol and Final Match State by idempotent transfer.
- Archive failure leaves retryable finalizing data in MatchRoom.
- Terminal live notification remains withheld until archive success.
- All gameplay-correction regression tests continue to pass unchanged.
- No backward-compatibility branch remains.
- `git diff --check` passes.
- `bun test` passes.
- `bun run check` passes.
- `bun run test:integration` passes.
- `bun run check:full` passes.

## Out Of Scope

- Undo or correction implementation;
- completed Accepted Command archival;
- tournament or secretary workflows;
- new statistics;
- WebSocket transport migration;
- a new package, repository abstraction, event-sourcing framework, or generic persistence layer.
