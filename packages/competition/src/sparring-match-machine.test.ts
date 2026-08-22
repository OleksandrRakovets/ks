import { describe, expect, test } from 'bun:test'

import { type BySeatNumber, type FrameOutcome, type MatchConfig, newMatchId, opponentOf, type Seat } from '@ks/core'
import * as v from 'valibot'

import { buildMatchConfig, CreateMatchRequestSchema } from './matches'
import {
  createInitialSnapshot,
  getPhase,
  projectLifecycleState,
  sendLifecycleEvent,
  type SparringMatchLifecycleEvent,
  SparringMatchMachine,
  type SparringMatchMachineContext,
  type SparringMatchSnapshot,
} from './sparring-match-machine'

const createRequest = v.parse(CreateMatchRequestSchema, {
  gameKey: 'strila-v2',
  targets: {
    frameTargetPointsBySeat: { A: 8, B: 8 },
    matchTargetFrames: 3,
  },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: 'gp_01HX0000000000000000000000' },
    { seat: 'B', playerRef: 'gp_01HX0000000000000000000001' },
  ],
})

function makeConfig(matchTargetFrames = 3, firstBreakerSeat: Seat = 'A'): MatchConfig {
  return buildMatchConfig(newMatchId(), {
    ...createRequest,
    targets: {
      frameTargetPointsBySeat: createRequest.targets.frameTargetPointsBySeat,
      matchTargetFrames,
    },
    firstBreakerSeat,
  })
}

function expectedBreaker(config: MatchConfig, frameIndex: number): Seat {
  return frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
}

function outcome(winnerSeat: Seat, score: BySeatNumber = winnerSeat === 'A' ? { A: 8, B: 4 } : { A: 4, B: 8 }): FrameOutcome {
  return {
    winnerSeat,
    score,
    winReason: 'target-reached',
  }
}

function startFrame(snapshot: SparringMatchSnapshot, config: MatchConfig, frameIndex: number): SparringMatchSnapshot {
  return sendLifecycleEvent(snapshot, {
    type: 'frame.started',
    frameIndex,
    breakerSeat: expectedBreaker(config, frameIndex),
  })
}

function completeFrame(
  snapshot: SparringMatchSnapshot,
  frameIndex: number,
  winnerSeat: Seat,
  score?: BySeatNumber,
): SparringMatchSnapshot {
  return sendLifecycleEvent(snapshot, {
    type: 'frame.completed',
    frameIndex,
    outcome: outcome(winnerSeat, score),
  })
}

function playFrame(
  snapshot: SparringMatchSnapshot,
  config: MatchConfig,
  frameIndex: number,
  winnerSeat: Seat,
  score?: BySeatNumber,
): SparringMatchSnapshot {
  return completeFrame(startFrame(snapshot, config, frameIndex), frameIndex, winnerSeat, score)
}

function expectProjection(snapshot: SparringMatchSnapshot) {
  return projectLifecycleState(snapshot)
}

function expectInvalid(snapshot: SparringMatchSnapshot, event: SparringMatchLifecycleEvent) {
  expect(() => sendLifecycleEvent(snapshot, event)).toThrow()
}

function withPatchedContext(
  snapshot: SparringMatchSnapshot,
  patch: Partial<SparringMatchMachineContext>,
): SparringMatchSnapshot {
  return {
    ...snapshot,
    context: {
      ...snapshot.context,
      ...patch,
    },
  }
}

function expectInvalidProjection(snapshot: SparringMatchSnapshot, message: string) {
  expect(() => projectLifecycleState(snapshot)).toThrow(message)
}

describe('sparring-match-machine: initialization', () => {
  test('starts in between-frames from complete MatchConfig', () => {
    const config = makeConfig()
    const snapshot = createInitialSnapshot(config)

    expect(getPhase(snapshot)).toBe('between-frames')
    expect(snapshot.context.config).toEqual(config)
    expect(snapshot.context.completedFrames).toEqual([])
    expect(snapshot.context.framesWonBySeat).toEqual({ A: 0, B: 0 })
    expect(snapshot.context.nextFrameIndex).toBe(1)
    expect(snapshot.context.activeFrame).toBeNull()
    expect(snapshot.context.winnerSeat).toBeNull()
    expect(expectProjection(snapshot)).toEqual({
      phase: 'between-frames',
      config,
      completedFrames: [],
      framesWonBySeat: { A: 0, B: 0 },
      nextFrameIndex: 1,
    })
  })
})

describe('sparring-match-machine: breaker policy', () => {
  test('uses first breaker on odd frames and alternates by seat', () => {
    const config = makeConfig(3, 'B')
    let snapshot = createInitialSnapshot(config)

    snapshot = startFrame(snapshot, config, 1)
    expect(snapshot.context.activeFrame).toEqual({ frameIndex: 1, breakerSeat: 'B' })

    snapshot = completeFrame(snapshot, 1, 'B')
    snapshot = startFrame(snapshot, config, 2)
    expect(snapshot.context.activeFrame).toEqual({ frameIndex: 2, breakerSeat: 'A' })

    snapshot = completeFrame(snapshot, 2, 'A')
    snapshot = startFrame(snapshot, config, 3)
    expect(snapshot.context.activeFrame).toEqual({ frameIndex: 3, breakerSeat: 'B' })
    expectProjection(snapshot)
  })
})

describe('sparring-match-machine: sequential lifecycle', () => {
  test('accepts sequential frame start and completion', () => {
    const config = makeConfig(3)
    let snapshot = createInitialSnapshot(config)

    snapshot = playFrame(snapshot, config, 1, 'A')
    expect(getPhase(snapshot)).toBe('between-frames')
    expect(snapshot.context.framesWonBySeat).toEqual({ A: 1, B: 0 })
    expect(snapshot.context.completedFrames).toEqual([
      {
        frameIndex: 1,
        breakerSeat: 'A',
        outcome: outcome('A'),
      },
    ])
    expect(snapshot.context.nextFrameIndex).toBe(2)
    expectProjection(snapshot)

    snapshot = playFrame(snapshot, config, 2, 'B')
    expect(getPhase(snapshot)).toBe('between-frames')
    expect(snapshot.context.framesWonBySeat).toEqual({ A: 1, B: 1 })
    expectProjection(snapshot)
  })
})

describe('sparring-match-machine: rejections', () => {
  test('rejects frame.started while a frame is active', () => {
    const config = makeConfig()
    let snapshot = createInitialSnapshot(config)
    snapshot = startFrame(snapshot, config, 1)

    expectInvalid(snapshot, {
      type: 'frame.started',
      frameIndex: 2,
      breakerSeat: expectedBreaker(config, 2),
    })
  })

  test('rejects frame.started with non-sequential index', () => {
    const config = makeConfig()
    const snapshot = createInitialSnapshot(config)

    expectInvalid(snapshot, {
      type: 'frame.started',
      frameIndex: 2,
      breakerSeat: expectedBreaker(config, 2),
    })
  })

  test('rejects frame.started with wrong breaker seat', () => {
    const config = makeConfig()
    const snapshot = createInitialSnapshot(config)

    expectInvalid(snapshot, {
      type: 'frame.started',
      frameIndex: 1,
      breakerSeat: opponentOf(config.firstBreakerSeat),
    })
  })

  test('rejects frame.completed without an active frame', () => {
    const config = makeConfig()
    const snapshot = createInitialSnapshot(config)

    expectInvalid(snapshot, {
      type: 'frame.completed',
      frameIndex: 1,
      outcome: outcome('A'),
    })
  })

  test('rejects frame.completed with mismatched frame index', () => {
    const config = makeConfig()
    let snapshot = createInitialSnapshot(config)
    snapshot = startFrame(snapshot, config, 1)

    expectInvalid(snapshot, {
      type: 'frame.completed',
      frameIndex: 2,
      outcome: outcome('A'),
    })
  })
})

describe('sparring-match-machine: non-winning completion', () => {
  test('returns to between-frames when match target is not reached', () => {
    const config = makeConfig(3)
    let snapshot = createInitialSnapshot(config)

    snapshot = playFrame(snapshot, config, 1, 'A')

    expect(getPhase(snapshot)).toBe('between-frames')
    expect(snapshot.context.activeFrame).toBeNull()
    expect(snapshot.context.winnerSeat).toBeNull()
    expectProjection(snapshot)
  })
})

describe('sparring-match-machine: winning completion', () => {
  test('records the winning frame and enters terminal match-over', () => {
    const config = makeConfig(2)
    let snapshot = createInitialSnapshot(config)

    snapshot = playFrame(snapshot, config, 1, 'A')
    snapshot = playFrame(snapshot, config, 2, 'A')

    expect(getPhase(snapshot)).toBe('match-over')
    expect(snapshot.context.winnerSeat).toBe('A')
    expect(snapshot.context.framesWonBySeat).toEqual({ A: 2, B: 0 })
    expect(snapshot.context.completedFrames).toHaveLength(2)
    expect(snapshot.context.activeFrame).toBeNull()
    expect(expectProjection(snapshot)).toEqual({
      phase: 'match-over',
      config,
      completedFrames: snapshot.context.completedFrames,
      framesWonBySeat: { A: 2, B: 0 },
      winnerSeat: 'A',
    })
  })

  test('match-winning completion with alternating winners selects the correct winner', () => {
    const config = makeConfig(2)
    let snapshot = createInitialSnapshot(config)

    snapshot = playFrame(snapshot, config, 1, 'A')
    snapshot = playFrame(snapshot, config, 2, 'B')
    snapshot = playFrame(snapshot, config, 3, 'B')

    expect(getPhase(snapshot)).toBe('match-over')
    expect(snapshot.context.winnerSeat).toBe('B')
    expect(snapshot.context.framesWonBySeat).toEqual({ A: 1, B: 2 })
    expectProjection(snapshot)
  })
})

describe('sparring-match-machine: topology', () => {
  test('defines only between-frames, frame-in-progress, and match-over states', () => {
    expect(Object.keys(SparringMatchMachine.states)).toEqual(['between-frames', 'frame-in-progress', 'match-over'])
    expect(SparringMatchMachine.config.initial).toBe('between-frames')
  })

  test('does not expose obsolete setup, match-point, or match-end transitions', () => {
    const config = makeConfig(1)
    let snapshot = createInitialSnapshot(config)

    expectInvalid(snapshot, { type: 'frame.completed', frameIndex: 1, outcome: outcome('A') })

    snapshot = playFrame(snapshot, config, 1, 'A')
    expect(getPhase(snapshot)).toBe('match-over')

    expectInvalid(snapshot, {
      type: 'frame.started',
      frameIndex: 2,
      breakerSeat: expectedBreaker(config, 2),
    })
    expectInvalid(snapshot, {
      type: 'frame.completed',
      frameIndex: 1,
      outcome: outcome('A'),
    })
  })
})

describe('sparring-match-machine: terminal rejection', () => {
  test('rejects lifecycle events after match-over', () => {
    const config = makeConfig(1)
    const snapshot = playFrame(createInitialSnapshot(config), config, 1, 'A')

    expect(getPhase(snapshot)).toBe('match-over')
    expectInvalid(snapshot, {
      type: 'frame.started',
      frameIndex: 2,
      breakerSeat: expectedBreaker(config, 2),
    })
    expectInvalid(snapshot, {
      type: 'frame.completed',
      frameIndex: 1,
      outcome: outcome('A'),
    })
  })
})

describe('sparring-match-machine: projection invariants', () => {
  test('hold stable projection invariants after every accepted transition', () => {
    const config = makeConfig(3)
    let snapshot = createInitialSnapshot(config)
    expectProjection(snapshot)

    snapshot = startFrame(snapshot, config, 1)
    expectProjection(snapshot)

    snapshot = completeFrame(snapshot, 1, 'A')
    expectProjection(snapshot)

    snapshot = startFrame(snapshot, config, 2)
    expectProjection(snapshot)

    snapshot = completeFrame(snapshot, 2, 'B')
    expectProjection(snapshot)

    snapshot = startFrame(snapshot, config, 3)
    expectProjection(snapshot)

    snapshot = completeFrame(snapshot, 3, 'A')
    expectProjection(snapshot)
  })

  test('rejects terminal nextFrameIndex drift', () => {
    const config = makeConfig(1)
    const snapshot = withPatchedContext(playFrame(createInitialSnapshot(config), config, 1, 'A'), {
      nextFrameIndex: 99,
    })

    expectInvalidProjection(snapshot, 'nextFrameIndex must equal completed frame count plus one')
  })

  test('rejects between-frames with a winner seat', () => {
    const snapshot = withPatchedContext(createInitialSnapshot(makeConfig()), {
      winnerSeat: 'A',
    })

    expectInvalidProjection(snapshot, 'between-frames must not have a winner')
  })

  test('rejects frame-in-progress with a winner seat', () => {
    const config = makeConfig()
    const snapshot = withPatchedContext(startFrame(createInitialSnapshot(config), config, 1), {
      winnerSeat: 'A',
    })

    expectInvalidProjection(snapshot, 'frame-in-progress must not have a winner')
  })

  test('rejects between-frames with an active frame', () => {
    const config = makeConfig()
    const snapshot = withPatchedContext(createInitialSnapshot(config), {
      activeFrame: { frameIndex: 1, breakerSeat: expectedBreaker(config, 1) },
    })

    expectInvalidProjection(snapshot, 'between-frames must not have an active frame')
  })

  test('rejects match-over with an active frame', () => {
    const config = makeConfig(1)
    const snapshot = withPatchedContext(playFrame(createInitialSnapshot(config), config, 1, 'A'), {
      activeFrame: { frameIndex: 2, breakerSeat: expectedBreaker(config, 2) },
    })

    expectInvalidProjection(snapshot, 'match-over must not have an active frame')
  })
})

describe('sparring-match-machine: metadata', () => {
  test('machine id is set', () => {
    expect(SparringMatchMachine.id).toBe('sparring-match')
  })
})
