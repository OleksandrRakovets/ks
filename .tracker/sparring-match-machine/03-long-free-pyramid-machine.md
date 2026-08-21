# Slice 3: Long Free Pyramid Machine

## Prerequisite

Slices 1 and 2 are accepted. Long free pyramid is the only remaining legacy gameplay session.

## Goal

Build `LongFreePyramidSparringFrameMachine` and a resident session covering its multi-rack lifecycle. Delete the imperative long runtime and final legacy adapter.

## Machine Contract

```ts
export type LongFreePyramidMachineInput = {
  readonly targetPointsBySeat: BySeatNumber
  readonly rackRollover: 14 | 15
}

export type LongFreePyramidCommand =
  | { readonly type: 'frame.commence'; readonly seat: Seat }
  | { readonly type: 'pot.record'; readonly seat: Seat; readonly points: 1 | 2 | 3 | 4 }
  | { readonly type: 'foul.commit'; readonly seat: Seat }
  | { readonly type: 'frame.award'; readonly seat: Seat }
```

Machine states:

```text
not-started
open-play
winner-determined
awaiting-award
frame-over
```

Export from the tooling module:

```ts
export const LongFreePyramidSparringFrameMachine =
  setup(...).createMachine(...)
export type LongFreePyramidSparringFrameSnapshot =
  SnapshotFrom<typeof LongFreePyramidSparringFrameMachine>
```

Context contains rack history, targets, rollover, fixed winner, and current messages. Pure calculations derive total score, current rack, balls removed, and balls on table.

Constructor configuration requires `rackRollover` 14 or 15.

## Behavior

- commence enters `open-play`,
- pot points are 1 through 4 and cannot exceed balls on table,
- scoring occurs in the current rack,
- target by pot enters `winner-determined`,
- only the fixed winner may continue scoring there,
- rack rollover appends a zero-score rack and one `rack-started` message,
- foul gives one point to the opponent and requires a ball on the current rack,
- each foul point counts as one removed ball for rollover and balls-on-table calculations,
- a target reached through foul enters `awaiting-award`,
- a fixed-winner foul enters `awaiting-award` without replacing the winner,
- no rollover occurs after entering `awaiting-award`,
- award is valid in `winner-determined` or `awaiting-award` for the fixed winner,
- award enters `frame-over` and returns accumulated multi-rack score,
- post-terminal commands reject.

## Session

Add package-private `LongFreePyramidGameplaySession implements GameplaySession<'free-pyramid-long'>`. It owns one actor, owner token, and revision and uses the Slice 1 prepared-transition contract.

`dispose()` follows the shared idempotent actor-stop and token-invalidation contract.

Replace the final legacy factory branch. Keep the temporary common state-in/state-out facade, implemented through this machine for current competition callers.

## Files

Add:

```text
packages/gameplay/src/long-free-pyramid/machine.ts
packages/gameplay/src/long-free-pyramid/machine.test.ts
packages/gameplay/src/long-free-pyramid/session.ts
packages/gameplay/src/long-free-pyramid/session.test.ts
```

Add `calculations.ts` only when both machine and projection modules consume the same pure calculations.

Update session factory, definitions, projections, API tests, registry tests, and shared session contract.

Delete:

```text
packages/gameplay/src/long-free-pyramid/runtime.ts
packages/gameplay/src/long-free-pyramid/legacy-session.ts
```

## Tests

Run the shared session contract and add scenarios for:

- required rollover configuration and both values,
- initial/commenced state,
- multi-rack score accumulation,
- rollover from pot and foul,
- rack-start message lifecycle,
- balls-on-table calculations,
- impossible pot and empty-rack foul rejection,
- target by pot and by foul,
- continued winner scoring and loser rejection,
- fixed winner after winner foul,
- `awaiting-award` behavior and no rollover there,
- award from both eligible phases,
- wrong-seat award rejection,
- accumulated outcome and projection schemas,
- protocol determinism and warm/replay equivalence,
- stale, reused, and foreign transition rejection.

Use the old runtime as temporary characterization and delete it with parity coverage in this slice.

## Verification

```text
bun test packages/gameplay/src/long-free-pyramid
bun test packages/gameplay/src/gameplay-session.contract.test.ts
bun run --cwd packages/gameplay typecheck
bun run check
```

## Exit Gate

- Long free pyramid has one authoritative machine and resident session.
- Rack, rollover, scoring, winner, and award behavior matches characterization.
- Every registered game key resolves to an actor-backed gameplay session.
- No gameplay runtime class or legacy adapter remains.
- The temporary common facade contains no gameplay rules.
