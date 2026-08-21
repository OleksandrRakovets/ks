# Slice 4: Production Sparring Lifecycle Machine

## Prerequisite

Slices 1 through 3 are accepted. Every registered game has an authoritative resident gameplay session.

## Goal

Replace the prototype with one production `SparringMatchMachine` that owns initialized sparring lifecycle policy. MatchRoom remains on the old reducer until Slice 7.

## Machine Contract

```ts
export type SparringMatchPhase = 'between-frames' | 'frame-in-progress' | 'match-over'

export type CompletedSparringFrame = {
  readonly frameIndex: number
  readonly breakerSeat: Seat
  readonly outcome: FrameOutcome
}

export type ActiveSparringFrame = {
  readonly frameIndex: number
  readonly breakerSeat: Seat
}

export type SparringMatchMachineContext = {
  readonly config: MatchConfig
  readonly completedFrames: readonly CompletedSparringFrame[]
  readonly framesWonBySeat: BySeatNumber
  readonly nextFrameIndex: number
  readonly activeFrame: ActiveSparringFrame | null
  readonly winnerSeat: Seat | null
}

export type SparringMatchLifecycleEvent =
  | {
      readonly type: 'frame.started'
      readonly frameIndex: number
      readonly breakerSeat: Seat
    }
  | {
      readonly type: 'frame.completed'
      readonly frameIndex: number
      readonly outcome: FrameOutcome
    }
```

`SparringMatchMachine` receives parsed `MatchConfig` as input and starts in `between-frames` with frame index 1, zero wins, no active frame, and no winner.

Topology:

```text
between-frames
  frame.started -> frame-in-progress

frame-in-progress
  non-winning frame.completed -> between-frames
  winning frame.completed     -> match-over

match-over (final)
```

## Rules

`frame.started` requires the next sequential index and expected breaker:

```ts
frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
```

`frame.completed` requires the active frame index, records its breaker and outcome, increments exactly one seat's wins, clears the active frame, and advances the next index. Reaching the match target enters terminal `match-over` with that winner.

The machine accepts no lifecycle event after terminal state. Package transition helpers report invalid transitions explicitly rather than treating XState's unchanged snapshot as acceptance.

## Stable Projection

Export a stable `SparringMatchLifecycleState` discriminated by the three phases. Enforce:

- completed indices are contiguous from 1,
- `nextFrameIndex === completedFrames.length + 1`,
- active frame index equals next index,
- frame outcomes reproduce `framesWonBySeat`,
- breakers follow configuration,
- winner exists exactly in `match-over`,
- only the winner reaches target in terminal state.

Raw machine, snapshot, input, and phase inspection are exported only from:

```text
@ks/competition/sparring-match-machine
```

The root package does not export actors, snapshots, context, or lifecycle events.

## Files

Add:

```text
packages/competition/src/sparring-match-machine.ts
packages/competition/src/sparring-match-machine.test.ts
```

Delete the prototype `match-sparring-machine.ts` and rename its package subpath. Keep `match-state.ts` temporarily as the production/parity oracle.

## Tests

Verify:

- direct initialization from complete config,
- first breaker and alternation,
- sequential start and completion,
- rejection of start while active,
- rejection of completion without/mismatching active frame,
- non-winning completion returns between frames,
- winning completion records the frame and enters final state,
- no separate setup, match-point, or match-end transition exists,
- terminal transitions reject,
- stable projection invariants hold after every accepted transition.

## Verification

```text
bun test packages/competition/src/sparring-match-machine.test.ts
bun run --cwd packages/competition typecheck
bun run --cwd apps/machine-explorer typecheck
bun run check
```

## Exit Gate

- One production machine defines sparring lifecycle topology.
- Its states are exactly `between-frames`, `frame-in-progress`, and `match-over`.
- It initializes from `MatchConfig` and terminates on the match-winning frame completion.
- The old reducer remains isolated and MatchRoom is unchanged.
