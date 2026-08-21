# Slice 2: Configured Regular Pyramid Machine

## Prerequisite

Slice 1 is accepted. `GameplaySession`, prepared transitions, the shared contract suite, and temporary pyramid session adapter exist.

## Goal

Make one configured `PyramidSparringFrameMachine` authoritative for:

- `free-pyramid`,
- `combined-pyramid`,
- `combined-pyramid-old`.

Delete the imperative pyramid runtime and temporary adapter after parity.

## Rules Contract

```ts
export type PyramidGameKey = 'free-pyramid' | 'combined-pyramid' | 'combined-pyramid-old'

export type PyramidRules<K extends PyramidGameKey = PyramidGameKey> = {
  readonly gameKey: K
  readonly allowNegative: boolean
  readonly foulPenalty: 'opponent-plus-one' | 'offender-minus-one'
  readonly shotPointOptions: readonly number[]
}
```

Define one exhaustive `PyramidRulesByGameKey` map:

| Key                    | Negative score | Foul        | Pot presets |
| ---------------------- | -------------- | ----------- | ----------- |
| `free-pyramid`         | clamp to zero  | opponent +1 | 1, 2, 4     |
| `combined-pyramid`     | clamp to zero  | opponent +1 | 1, 2        |
| `combined-pyramid-old` | allowed        | offender -1 | 1, 2        |

Machine input is `{ targetPointsBySeat, rules }`.

## Machine Contract

Rename the prototype to `PyramidSparringFrameMachine`. Its commands are:

```ts
export type PyramidCommand =
  | { readonly type: 'frame.commence'; readonly seat: Seat }
  | { readonly type: 'pot.record'; readonly seat: Seat; readonly points: number }
  | { readonly type: 'foul.commit'; readonly seat: Seat }
  | { readonly type: 'frame.award'; readonly seat: Seat }
```

Export from the tooling module:

```ts
export const PyramidSparringFrameMachine = setup(...).createMachine(...)
export type PyramidSparringFrameSnapshot =
  SnapshotFrom<typeof PyramidSparringFrameMachine>
```

Use `seat` consistently; remove prototype `actor` fields.

States remain:

```text
not-started
open-play
winner-determined
frame-over
```

Behavior:

- commence is valid only in `not-started`,
- pots and fouls are valid in `open-play`,
- pot points must be one of the configured `shotPointOptions`,
- configured scoring rules determine score changes,
- reaching target fixes `winnerSeat` and enters `winner-determined`,
- only the fixed winner may continue pot/foul commands,
- `frame.award` requires the fixed winner and enters `frame-over`,
- outcome is `{ winnerSeat, score, winReason: 'target-reached' }`,
- post-terminal commands reject.

A foul that gives the opponent their target fixes that opponent as winner.

## Session

Add package-private:

```ts
class PyramidGameplaySession<K extends PyramidGameKey>
  implements GameplaySession<K>
```

It owns the selected rules, one actor, owner token, and revision. It implements the exact pure-decision and commit-time token checks established in Slice 1.

`dispose()` follows the shared idempotent actor-stop and token-invalidation contract.

Replace all three legacy factory branches with this session.

The temporary state-in/state-out facade resolves validated `PyramidFrameState` into the machine and contains no scoring conditions.

## Files

Add:

```text
packages/gameplay/src/pyramid/rules.ts
packages/gameplay/src/pyramid/session.ts
packages/gameplay/src/pyramid/session.test.ts
```

Rename:

```text
pyramid/machine-sparring.ts      -> pyramid/machine.ts
pyramid/machine-sparring.test.ts -> pyramid/machine.test.ts
```

Update session factory, pyramid definitions/projections/API tests, registry tests, and shared session contract.

Delete:

```text
packages/gameplay/src/pyramid/runtime.ts
packages/gameplay/src/pyramid/legacy-session.ts
```

Delete `PyramidRuntimeConfig`; `PyramidRules` is the single configuration type.

## Tests

Run the shared session contract for all three keys. Add focused tests for:

- exhaustive rules selection,
- asymmetric targets,
- commence phase,
- positive scoring and free-pyramid +4 preset,
- combined variants excluding +4 presets,
- score clamping and negative-score variant,
- both foul policies,
- foul causing opponent target,
- winner determination and continued winner scoring,
- loser rejection after winner determination,
- wrong-seat award rejection,
- schema-valid outcome and projections,
- warm/replay equivalence,
- stale, reused, and foreign transition rejection.

Use current runtime tests as temporary characterization. Delete parity coverage and the runtime in this slice.

## Verification

```text
bun test packages/gameplay/src/pyramid
bun test packages/gameplay/src/gameplay-session.contract.test.ts
bun run --cwd packages/gameplay typecheck
bun run check
```

## Exit Gate

- One configured machine implements all regular pyramid variants.
- Variant selection is an exhaustive rules map.
- All three factory branches return resident actor-backed sessions.
- No imperative pyramid runtime or legacy adapter remains.
- Session and scenario behavior matches the characterized production behavior.
