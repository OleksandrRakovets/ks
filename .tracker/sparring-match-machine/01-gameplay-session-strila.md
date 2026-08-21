# Slice 1: Resident Gameplay Session And Strila

## Goal

Create the production resident gameplay-session contract and make `StrilaSparringFrameMachine` the sole Strila transition implementation. Preserve the temporary state-in/state-out facade for current callers, implemented through the machine.

## Production Contract

Export from `@ks/gameplay/server`:

```ts
export const GameCommandRejectionSchema = v.object({
  code: v.literal('command-not-available'),
})

export type GameCommandRejection = v.InferOutput<typeof GameCommandRejectionSchema>

declare const PreparedGameTransitionBrand: unique symbol

export type PreparedGameTransition<K extends RegisteredGameKey> = {
  readonly gameKey: K
  readonly [PreparedGameTransitionBrand]: true
}

export type PreparedGameCommandResult<K extends RegisteredGameKey> = {
  readonly state: GameStateFor<K>
  readonly outcome?: FrameOutcome
  readonly protocolEntries: readonly ProtocolEntry[]
}

export type GameCommandDecision<K extends RegisteredGameKey> =
  | {
      readonly _tag: 'accepted'
      readonly result: PreparedGameCommandResult<K>
      readonly transition: PreparedGameTransition<K>
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: GameCommandRejection
    }

export interface GameplaySession<K extends RegisteredGameKey> {
  readonly gameKey: K
  readonly state: GameStateFor<K>

  decide(commandType: string, command: ControlCommandPayload): GameCommandDecision<K>

  applyCommitted(transition: PreparedGameTransition<K>): PreparedGameCommandResult<K>

  deriveControl(): ControlProjectionFor<K>
  deriveSummary(): SummaryProjectionFor<K>
  deriveScoreboard(): ScoreboardProjectionFor<K>
  dispose(): void
}

export function createGameplaySession<K extends RegisteredGameKey>(gameKey: K, args: GameCreateStateArgs): GameplaySession<K>
```

The prepared-transition type is public and opaque so competition can retain and return it. Its construction and representation are package-private. It records owner identity, session revision, previous snapshot, parsed event, candidate snapshot/result, and consumed state. Consumers neither inspect nor serialize it.

## Strila Session

Rename the production machine symbols:

```ts
export const StrilaSparringFrameMachine = setup(...).createMachine(...)
export type StrilaSparringFrameSnapshot =
  SnapshotFrom<typeof StrilaSparringFrameMachine>
```

Add package-private `StrilaGameplaySession implements GameplaySession<'strila-v2'>`. It owns one started actor and a numeric revision for its lifetime.

`decide`:

1. Parses the current command with `StrilaCommandSchema`.
2. Returns rejection for malformed, unsupported, phase-invalid, or unavailable-ball commands.
3. Computes the candidate through XState's pure `transition` API.
4. Derives validated state, protocol entries, and optional frame outcome.
5. Returns an owner- and revision-bound prepared transition.
6. Leaves actor snapshot and revision unchanged.

`applyCommitted`:

1. Verifies game key, owner, revision, previous snapshot, and unused token.
2. Sends the prepared parsed event to the resident actor.
3. Verifies resulting state equals the prepared result.
4. Marks the token consumed and increments revision after verification.

Applying a stale, foreign, or reused token throws before mutation. A post-send mismatch marks the session unusable, stops its actor, invalidates every token, and throws a defect. `dispose()` idempotently stops the actor and invalidates every prepared transition; later session operations throw.

Malformed game payloads temporarily return `GameCommandRejection` through Slice 8 because this session still receives a broad transport shape. Slice 9 moves malformed input to a non-receipted parse-failure path.

## Exhaustive Factory

Add `src/gameplay-session.ts` and `src/session-factory.ts`. `createGameplaySession` uses an exhaustive switch over every registered key.

Until Slices 2 and 3, pyramid and long-free-pyramid branches use package-private legacy session adapters that implement the same prepared-transition ownership rules over explicit state. Those adapters contain no new gameplay policy.

Keep these current server exports for callers awaiting Slice 5:

- `createInitialGameState`,
- `applyGameCommand`,
- `deriveGameControl`,
- `deriveGameSummary`,
- `deriveGameScoreboard`,
- `parseGameControl`,
- `parseGameKey`.

For Strila, they delegate to `StrilaSparringFrameMachine`; no separate reducer remains.

## Files

Add:

```text
packages/gameplay/src/gameplay-session.ts
packages/gameplay/src/session-factory.ts
packages/gameplay/src/gameplay-session.contract.test.ts
packages/gameplay/src/strila-v2/session.ts
packages/gameplay/src/strila-v2/session.test.ts
packages/gameplay/src/pyramid/legacy-session.ts
packages/gameplay/src/long-free-pyramid/legacy-session.ts
```

Rename:

```text
strila-v2/machine-sparring.ts      -> strila-v2/machine.ts
strila-v2/machine-sparring.test.ts -> strila-v2/machine.test.ts
```

Update `contract/server.ts`, `constants.ts`, `gameplay.ts`, registry/factory imports, and Strila simulations.

Delete:

```text
packages/gameplay/src/runtime-factory.ts
packages/gameplay/src/strila-v2/runtime.ts
packages/gameplay/src/strila-v2/runtime.test.ts
```

Remove public `StrilaGameplayRuntime` and `GameplayDefinition`. The registry retains type correlations and metadata; behavior comes from session creation.

## Tests

Create a reusable gameplay-session contract suite. For Strila verify:

- initial state and all projections satisfy schemas,
- decision does not mutate resident state,
- accepted decision returns deterministic result and opaque token,
- apply advances once,
- reused, stale, and foreign tokens throw,
- two decisions at one revision become mutually stale after one applies,
- malformed and unavailable commands reject without mutation,
- warm sequential commands equal replay into a fresh session,
- protocol entries are deterministic,
- `frame.award` returns a valid outcome,
- post-`frame-over` commands reject.

Retain specialized foul, penalty, ball-in-hand, respotted-black, handicap, continued-winner-scoring, and award scenarios. Convert simulations to one resident session with decide/apply steps.

## Verification

```text
bun test packages/gameplay/src/gameplay-session.contract.test.ts
bun test packages/gameplay/src/strila-v2
bun run --cwd packages/gameplay typecheck
bun run check
```

## Exit Gate

- `StrilaSparringFrameMachine` is the only Strila transition implementation.
- One Strila session retains one actor across warm commands.
- Decision is non-mutating and prepared transitions are single-use/revision-bound.
- Existing Strila state, protocol, projection, and outcome behavior is preserved.
- The gameplay-session factory is exhaustive.
- Production exports expose no actor or snapshot type.
- Temporary legacy adapters exist only for pyramid and long free pyramid.

## Post-Slice 1 Typing Note (Validated, Non-Blocking)

TypeScript does not narrow generic `K` through the exhaustive `createGameplaySession` / `restoreGameplaySession` switch in `session-factory.ts`. Each branch returns a concrete session type, but the compiler still sees `GameplaySession<RegisteredGameKey>` at the switch boundary.

`restoreGameplaySession` therefore relies on two manual correlation steps that are correct at runtime but not enforced by the type system:

1. Per-branch `state as GameStateFor<'…'>` casts after the exhaustive `gameKey` switch.
2. `asGameplaySession`, which reasserts `GameplaySession<K>` on the branch-produced session.

This behavior is correct for Slice 1 and is not a blocker for acceptance. Revisit the type relationship after Slice 1, preferably via a registry/map (or equivalent keyed factory table) that lets TypeScript correlate `gameKey`, `GameStateFor<K>`, and `GameplaySession<K>` per branch without layered assertions.
