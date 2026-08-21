# Slice 9: Game-Specific Typed Command Parsing

## Prerequisite

Slice 8 is accepted. All production game decisions use resident sessions, while their command input remains `commandType: string` plus generic payload.

## Goal

Parse transport commands into game-keyed command unions before session decision. Keep malformed input, expected state rejection, and defects distinct.

## Command Types

Gameplay definitions own `v.strictObject` variant schemas. Unknown fields and a payload-supplied `type` are rejected.

```ts
export type StrilaCommand =
  | FrameCommenceCommand
  | PotRecordWithBallsCommand
  | MissRecordCommand
  | FoulCommitCommand
  | PenaltySelectCommand
  | FrameAwardCommand

export type PyramidCommand =
  | FrameCommenceCommand
  | { readonly type: 'pot.record'; readonly seat: Seat; readonly points: number }
  | FoulCommitCommand
  | FrameAwardCommand

export type LongFreePyramidCommand =
  | FrameCommenceCommand
  | { readonly type: 'pot.record'; readonly seat: Seat; readonly points: 1 | 2 | 3 | 4 }
  | FoulCommitCommand
  | FrameAwardCommand
```

Use strict Valibot variant schemas. Structural constraints parse here; phase, seat turn, configured preset legality, and winner legality remain decision rejections.

Extend `GameContracts`:

```ts
export type GameCommandFor<K extends RegisteredGameKey> = GameContracts[K]['command']

export type AnyGameCommand = {
  [K in RegisteredGameKey]: {
    readonly gameKey: K
    readonly command: GameCommandFor<K>
  }
}[RegisteredGameKey]
```

## Registry And Parser

One exhaustive server registry associates each key with command schema and session factory. No second command-schema switch/map exists.

Export from `@ks/gameplay/server`:

```ts
export type GameCommandParseFailure = {
  readonly _tag: 'game-command-parse-failure'
  readonly gameKey: RegisteredGameKey
  readonly commandType: string
  readonly issues: readonly v.BaseIssue<unknown>[]
}

export type ParseGameCommandResult<K extends RegisteredGameKey> =
  { readonly _tag: 'parsed'; readonly command: GameCommandFor<K> } | GameCommandParseFailure

export function parseGameCommand<K extends RegisteredGameKey>(
  gameKey: K,
  input: { readonly commandType: string; readonly command: unknown },
): ParseGameCommandResult<K>
```

`commandType` is the transport discriminator. Reject a payload-supplied `type`. Parser failures are values; registry defects throw.

## Session Contract

Change:

```ts
decide(command: GameCommandFor<K>): GameCommandDecision<K>
```

Sessions parse no unknown transport input.

Use stable rejection:

```ts
export const GameCommandRejectionSchema = v.object({
  code: v.literal('command-not-available'),
})

export type GameCommandRejection = v.InferOutput<typeof GameCommandRejectionSchema>
```

Game-specific rejection extensions require a distinction that changes recovery or diagnostics; arbitrary exception messages are not persisted.

## Competition Contract

```ts
export type SparringGameCommand = {
  [K in RegisteredGameKey]: {
    readonly type: 'game.command'
    readonly gameKey: K
    readonly command: GameCommandFor<K>
  }
}[RegisteredGameKey]

export type SparringMatchCommand =
  | { readonly type: 'frame.start' }
  | { readonly type: 'frame.commence'; readonly seat: Seat }
  | { readonly type: 'frame.concede'; readonly seat: Seat }
  | SparringGameCommand
```

`parseSparringMatchCommand(gameKey, input)` parses match-owned commands itself and delegates game envelopes to `parseGameCommand`. Authoritative config supplies game key; clients cannot select it.

Match-owned `frame.commence` remains under competition breaker policy, which constructs the typed gameplay commencement command after validation.

## Outcome Classification

### Parse failure

Unknown/malformed type, payload, seat, balls, points, unknown fields, or command ownership. It produces no decision, facts, or normal command receipt and maps to `invalid-command-body` with status 400.

### Expected rejection

A valid typed command is unavailable in current authoritative state. It produces an idempotent rejected receipt and no facts.

### Defect

Registry gaps, key mismatches, impossible accepted replay, stale/foreign prepared transitions, or invalid machine output throw and produce no receipt.

Keep unsupported syntax in the parse-failure path and retain the typed `GameCommandRejection` inside match rejection.

## Fact Serialization And Replay

Keep stored `game.command` representation as command type plus payload. Acceptance serializes canonical parsed command without its `type`; strict parsing rejects unknown input fields before persistence.

Replay selects parser by persisted game key, reparses stored command, verifies key agreement, and applies the typed command. Persisted parse failure is journal corruption.

## Files

Update:

```text
packages/gameplay/src/registry.ts
packages/gameplay/src/gameplay-session.ts
packages/gameplay/contract/definitions.ts
packages/gameplay/contract/server.ts
packages/gameplay/src/strila-v2/definitions.ts
packages/gameplay/src/strila-v2/session.ts
packages/gameplay/src/pyramid/definitions.ts
packages/gameplay/src/pyramid/session.ts
packages/gameplay/src/long-free-pyramid/definitions.ts
packages/gameplay/src/long-free-pyramid/session.ts
packages/competition/src/sparring-match.ts
packages/competition/src/index.ts
do/match-room/src/MatchRoom.ts
do/match-room/src/rpc-contract.ts
packages/application/src/use-cases.test.ts
```

Remove broad `applyGameCommand` and any session method accepting unknown payload.

## Tests

Shared parser tests for every key cover every valid command, unknown type, non-object payload, payload discriminator, invalid/missing fields, canonical output, and exhaustive registry.

Specialized parsing covers Strila ball constraints, pyramid integer points, and long-pyramid 1-through-4 points.

Session tests accept typed commands only and distinguish unavailable command from defects.

Competition tests cover authoritative key injection, source ownership, no decision on parse failure, canonical fact serialization, and typed rejection.

Replay tests cover command round trip, malformed persisted command, key mismatch, protocol preservation, and warm/cold equality.

MatchRoom/application tests prove malformed input creates no receipt, valid unavailable input creates rejected receipt, and defects create no outcome.

## Verification

```text
bun test packages/gameplay/src
bun test packages/competition/src
bun test do/match-room/src
bun run check
```

## Exit Gate

- Every game key has one authoritative command schema and session factory entry.
- Gameplay decisions accept `GameCommandFor<K>` only.
- Broad string/object commands exist only at transport and stored-fact boundaries.
- Parse failure, expected rejection, and defects follow distinct paths.
- Unsupported syntax is not persisted as domain rejection.
- Replay reparses accepted commands and fails closed.
