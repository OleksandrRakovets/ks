# Slice 6: Fact Envelope And Tagged Receipt Storage

## Prerequisite

Slice 5 is accepted. `@ks/core` exports fact schemas and accepted references; `@ks/competition` exports the rejection schema.

## Goal

Persist server-authored match facts with command causation and provide tagged accepted/rejected receipt storage for Slice 7. The current command handler uses the new accepted storage path for non-empty fact batches. Until Slice 7 replaces policy, a command that produces no facts returns `invalid-command-body` and creates no receipt; it never writes an empty accepted outcome. `commitRejected` is exercised through storage tests and becomes a production command path in Slice 7.

## Core Fact Envelope

Use the Slice 5 names throughout core, application, MatchRoom, and fixtures:

```ts
MatchFactDraft
MatchFact
StoredMatchFact
AcceptedFactRef
```

Remove `ClientFact`, `StoredFact`, `AcceptedFact`, `ClientId`, `clientId`, and `clientSeq`. Rename `at` to `occurredAt`.

`causedByCommandId` is absent on `match.created` and required on every submitted-command fact. Every fact in one accepted batch carries the receipt command ID. Keep `caused_by_command_id` nullable: `NULL` represents creation without inventing a reserved fake `CommandId`; schemas reject null causation on command-produced facts and non-null causation on creation.

## Receipt Contract

```ts
export const CommandReceiptOutcomeSchema = v.variant('_tag', [
  v.object({
    _tag: v.literal('accepted'),
    accepted: v.pipe(v.array(AcceptedFactRefSchema), v.minLength(1)),
  }),
  v.object({
    _tag: v.literal('rejected'),
    reason: SparringMatchRejectionSchema,
  }),
])

export type CommandReceiptOutcome = v.InferOutput<typeof CommandReceiptOutcomeSchema>

export type CommandReceipt = {
  readonly requestJson: string
  readonly outcome: CommandReceiptOutcome
}
```

Empty accepted outcomes are invalid.

Place these schemas and types in `do/match-room/src/storage/command-receipt.ts`. MatchRoom may import competition's rejection schema; core remains independent of competition.

## SQLite Schema

`accepted_facts` stores:

```text
seq
fact_id
match_id
type
payload_json
occurred_at
caused_by_command_id nullable
received_at
```

`command_receipts` stores:

```text
command_id
request_json
outcome_json
```

Remove client columns and `accepted_json`. Regenerate the unreleased initial migration and snapshot; add no compatibility migration.

## Store Contract

```ts
class ActiveMatchStore {
  match(): ActiveMatchRecord | null
  factsAfter(since: number): StoredMatchFact[]
  receipt(commandId: CommandId): CommandReceipt | null

  commitCreation(args: { readonly initialization: ActiveMatchInitialization; readonly fact: MatchFact }): StoredMatchFact

  commitAccepted(args: {
    readonly facts: readonly [MatchFact, ...MatchFact[]]
    readonly receipt: {
      readonly commandId: CommandId
      readonly requestJson: string
    }
  }): {
    readonly outcome: Extract<CommandReceiptOutcome, { _tag: 'accepted' }>
    readonly storedFacts: readonly [StoredMatchFact, ...StoredMatchFact[]]
  }

  commitRejected(args: {
    readonly receipt: {
      readonly commandId: CommandId
      readonly requestJson: string
    }
    readonly reason: SparringMatchRejection
  }): Extract<CommandReceiptOutcome, { _tag: 'rejected' }>
}

type ActiveMatchInitialization = {
  readonly matchId: MatchId
  readonly controlSecret: string
  readonly configJson: string
  readonly createdAt: UnixEpochMilliseconds
}
```

Use `ActiveMatchInitialization` in `commitCreation` instead of the placeholder `Initialization` name.

`commitCreation` atomically inserts the room and sole creation fact.

`commitAccepted` verifies active room, non-empty same-match facts, and matching command causation; allocates contiguous sequences; inserts facts; advances latest sequence; sets finalizing when `match.ended` exists; and inserts the accepted receipt in one transaction.

`commitRejected` inserts only the receipt and changes neither sequence nor status.

Rename row codecs/files to `stored-match-fact-row`.

## RPC Contract

```ts
export const SubmitCommandBodySchema = v.object({
  matchId: MatchIdSchema,
  commandId: CommandIdSchema,
  command: ControlCommandSchema,
})

export type SubmitCommandResult =
  | {
      readonly ok: true
      readonly outcome: CommandReceiptOutcome
      readonly finalizing?: true
    }
  | {
      readonly ok: false
      readonly error: 'invalid-command-body' | 'unknown-match' | 'command-id-conflict' | 'match-locked'
      readonly status: number
    }
```

Domain rejection is a successful RPC exchange with a rejected outcome. `finalizing` appears only on accepted terminal batches and their idempotent retries.

## Receipt Rules

Canonical request identity is:

```ts
function canonicalCommandJson(command: ControlCommand): string {
  return JSON.stringify(v.parse(ControlCommandSchema, command))
}
```

Both lookup and insertion use this parsed representation. Schema output order defines key order; unknown transport fields do not enter the canonical value. Tests cover identical parsed commands and changed command type/payload.

- Same ID and canonical request returns stored outcome without deciding again.
- Same ID and different request returns `command-id-conflict`.
- Rejected receipt remains rejected after state changes.
- Receipt lookup precedes finalizing lock so terminal retries succeed.
- New IDs are locked while finalizing.
- Malformed input, conflicts, unknown/locked rooms, storage failures, and defects create no receipt.

## Files

Update:

```text
packages/core/src/facts.ts
packages/core/src/facts.test.ts
packages/core/src/index.ts
packages/competition/src/index.ts
do/match-room/src/rpc-contract.ts
do/match-room/src/storage/schema.ts
do/match-room/src/storage/store.ts
do/match-room/drizzle/20260819215046_init/migration.sql
do/match-room/drizzle/20260819215046_init/snapshot.json
do/match-room/drizzle/migrations.js
```

Add `do/match-room/src/storage/command-receipt.ts` and its test. Update all affected fixtures/imports.

Rename:

```text
storage/accepted-fact-row.ts      -> storage/stored-match-fact-row.ts
storage/accepted-fact-row.test.ts -> storage/stored-match-fact-row.test.ts
```

## Tests

Codec tests cover all fact variants, causation rules, malformed envelope/payload/JSON, creation identity, and removed client fields.

Receipt tests cover every accepted/rejected variant, non-empty acceptance, malformed tags/references/rejections, and corruption diagnostics with command ID.

SQLite-backed tests cover creation atomicity, multi-fact contiguous commit, causation, rejected receipt without sequence change, terminal status, and injected transaction rollback.

## Verification

```text
bun test packages/core/src/facts.test.ts
bun test do/match-room/src/storage
bun run --cwd do/match-room typecheck
bun run check
```

## Exit Gate

- No fact or table uses client-authored terminology/columns.
- Command facts persist causation.
- Receipts persist tagged non-empty acceptance or explicit rejection.
- Rejection is durably idempotent without facts or sequence movement.
- Drizzle schema and regenerated initial migration agree.
- Storage corruption fails closed.
