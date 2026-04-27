import { assign, getInitialSnapshot, getNextSnapshot, setup, type SnapshotFrom } from 'xstate'

import {
  STRILA_COLORED_BALLS,
  type StrilaColoredBall,
  type StrilaContext,
  type StrilaEvent,
  type StrilaPhase,
  type StrilaSeat,
  type StrilaWinReason,
} from './definitions'

export function opponentOf(seat: StrilaSeat): StrilaSeat {
  return seat === 'A' ? 'B' : 'A'
}

function pointsForPottedBalls(pottedBalls: (0 | StrilaColoredBall)[]): number {
  return pottedBalls.reduce<number>((sum, ball) => sum + (ball === 0 ? 1 : 2), 0)
}

function removePottedColoredBalls(onTable: StrilaColoredBall[], pottedBalls: (0 | StrilaColoredBall)[]): StrilaColoredBall[] {
  const potted = new Set(pottedBalls.filter((b): b is StrilaColoredBall => b !== 0))
  return onTable.filter((b) => !potted.has(b))
}

function addPoints(score: { A: number; B: number }, seat: StrilaSeat, points: number): { A: number; B: number } {
  return seat === 'A' ? { A: score.A + points, B: score.B } : { A: score.A, B: score.B + points }
}

function nextCueBallSerialPots(
  prev: StrilaContext['cueBallSerialPots'],
  actor: StrilaSeat,
  pottedBalls: (0 | StrilaColoredBall)[],
): StrilaContext['cueBallSerialPots'] {
  if (!pottedBalls.includes(0)) return null
  if (prev?.seat !== actor) return { seat: actor, count: 1 }
  return { seat: actor, count: prev.count >= 2 ? 2 : 2 }
}

type PotEvent = Extract<StrilaEvent, { type: 'pot.record' }>

export const strilaSparringMachine = setup({
  types: {
    context: {} as StrilaContext,
    events: {} as StrilaEvent,
    input: {} as { targetPointsBySeat?: { A: number; B: number } },
  },
  guards: {
    isThirdCueBallPot: ({ context, event }) => {
      const e = event as PotEvent
      return context.cueBallSerialPots?.seat === e.actor && context.cueBallSerialPots.count >= 2 && e.pottedBalls.includes(0)
    },
    isIllegalBallInHandPot: ({ event }) => {
      const e = event as PotEvent
      return e.pottedBalls.includes(0) && e.pottedBalls.some((b) => b !== 0)
    },
    isValidRespottedBlackOpeningPot: ({ event }) => {
      const e = event as PotEvent
      return e.pottedBalls.length === 1 && e.pottedBalls[0] === 7
    },
    isTargetReachedAfterPot: ({ context, event }) => {
      const e = event as PotEvent
      const next = addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls))
      return next.A >= context.targetPoints.A || next.B >= context.targetPoints.B
    },
    isRespottedBlackTrigger: ({ context, event }) => {
      const e = event as PotEvent
      const next = addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls))
      const nextBalls = removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls)
      return nextBalls.length === 0 && next.A === 8 && next.B === 8
    },
    isBallInHandChoice: ({ event }) => event.type === 'penalty.select' && event.choice === 'ball-in-hand',
    isPlayFromPositionChoice: ({ event }) => event.type === 'penalty.select' && event.choice === 'play-from-position',
    isPassPositionChoice: ({ event }) => event.type === 'penalty.select' && event.choice === 'pass-position',
    canConcede: ({ context }) => context.winner === null,
  },
  actions: {
    applyPot: assign(({ context, event }) => {
      const e = event as PotEvent
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        cueBallSerialPots: nextCueBallSerialPots(context.cueBallSerialPots, e.actor, e.pottedBalls),
      }
    }),
    applyPotResetStreak: assign(({ context, event }) => {
      const e = event as PotEvent
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        cueBallSerialPots: null,
      }
    }),
    applyRespottedBlackPot: assign(({ context, event }) => {
      const e = event as PotEvent
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: [] as StrilaColoredBall[],
        winner: e.actor,
        winReason: 'respotted-black-won' as const,
      }
    }),
    setWinnerFromTarget: assign(({ context }) => ({
      winner: (context.score.A >= context.targetPoints.A ? 'A' : 'B') as StrilaSeat,
      winReason: 'target-reached' as const,
    })),
    setRespottedBlackOpening: assign({
      coloredBallsOnTable: [7] as StrilaColoredBall[],
    }),
    setFoulResponse: assign(({ event }) => {
      const e = event as PotEvent | Extract<StrilaEvent, { type: 'foul.commit' }>
      return {
        foulOffender: e.actor,
      }
    }),
    setRespottedBlackOpeningFoulWinner: assign(({ event }) => {
      const e = event as PotEvent
      return {
        coloredBallsOnTable: [7] as StrilaColoredBall[],
        winner: opponentOf(e.actor),
        winReason: 'automatic-foul' as const,
      }
    }),
    setFoulWinner: assign(({ event }) => {
      const e = event as Extract<StrilaEvent, { type: 'foul.commit' }>
      return {
        winner: opponentOf(e.actor),
        winReason: 'automatic-foul' as const,
      }
    }),
    setConcedeWinner: assign(({ event }) => {
      const e = event as Extract<StrilaEvent, { type: 'frame.concede' }>
      return {
        winner: opponentOf(e.actor),
        winReason: 'conceded' as const,
      }
    }),
    applyBallInHand: assign(() => {
      return {
        foulOffender: null as StrilaSeat | null,
      }
    }),
    applyPlayFromPosition: assign(({ context, event }) => {
      const e = event as Extract<StrilaEvent, { type: 'penalty.select' }>
      return {
        score: addPoints(context.score, e.actor, 1),
        cueBallSerialPots: null,
        foulOffender: null as StrilaSeat | null,
      }
    }),
    applyPassPosition: assign(({ context, event }) => {
      const e = event as Extract<StrilaEvent, { type: 'penalty.select' }>
      return {
        score: addPoints(context.score, e.actor, 1),
        cueBallSerialPots: null,
        foulOffender: null as StrilaSeat | null,
      }
    }),
    switchToOpponent: assign(() => {
      return {
        cueBallSerialPots: null,
      }
    }),
    applyWinnerDeterminedPot: assign(({ context, event }) => {
      const e = event as PotEvent
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
      }
    }),
    commence: assign(() => {
      return {
        score: { A: 0, B: 0 },
        coloredBallsOnTable: [...STRILA_COLORED_BALLS] as StrilaColoredBall[],
        cueBallSerialPots: null,
      }
    }),
  },
}).createMachine({
  id: 'strila-sparring',
  initial: 'not-started',
  context: ({ input }) => ({
    score: { A: 0, B: 0 },
    targetPoints: input?.targetPointsBySeat ?? { A: 9, B: 9 },
    coloredBallsOnTable: [...STRILA_COLORED_BALLS] as StrilaColoredBall[],
    cueBallSerialPots: null,
    foulOffender: null,
    winner: null,
    winReason: null,
  }),

  states: {
    'not-started': {
      on: {
        'frame.commence': {
          target: 'open-play',
          actions: 'commence',
        },
      },
    },

    'open-play': {
      on: {
        'pot.record': [
          {
            guard: 'isThirdCueBallPot',
            target: 'foul-committed',
            actions: 'setFoulResponse',
          },
          {
            guard: 'isTargetReachedAfterPot',
            target: 'winner-determined',
            actions: ['applyPot', 'setWinnerFromTarget'],
          },
          {
            guard: 'isRespottedBlackTrigger',
            target: 'respotted-black',
            actions: ['applyPot', 'setRespottedBlackOpening'],
          },
          {
            target: 'open-play',
            actions: 'applyPot',
          },
        ],
        'foul.commit': {
          target: 'foul-committed',
          actions: 'setFoulResponse',
        },
      },
    },

    'foul-committed': {
      initial: 'penalty-selection',
      onDone: {
        target: 'open-play',
      },
      states: {
        'penalty-selection': {
          on: {
            'penalty.select': [
              {
                guard: 'isBallInHandChoice',
                target: 'ball-in-hand',
                actions: 'applyBallInHand',
              },
              {
                guard: 'isPlayFromPositionChoice',
                target: 'resolved',
                actions: 'applyPlayFromPosition',
              },
              {
                guard: 'isPassPositionChoice',
                target: 'resolved',
                actions: 'applyPassPosition',
              },
            ],
          },
        },

        'ball-in-hand': {
          on: {
            'pot.record': [
              {
                guard: 'isIllegalBallInHandPot',
                target: 'penalty-selection',
                actions: 'setFoulResponse',
              },
              {
                guard: 'isTargetReachedAfterPot',
                target: '#strila-sparring.winner-determined',
                actions: ['applyPotResetStreak', 'setWinnerFromTarget'],
              },
              {
                guard: 'isRespottedBlackTrigger',
                target: '#strila-sparring.respotted-black',
                actions: ['applyPotResetStreak', 'setRespottedBlackOpening'],
              },
              {
                target: 'resolved',
                actions: 'applyPotResetStreak',
              },
            ],
            'miss.record': {
              target: 'resolved',
              actions: 'switchToOpponent',
            },
            'foul.commit': {
              target: 'penalty-selection',
              actions: 'setFoulResponse',
            },
          },
        },

        resolved: {
          type: 'final',
        },
      },
    },

    'respotted-black': {
      initial: 'opening',
      onDone: {
        target: 'winner-determined',
      },
      on: {
        'foul.commit': {
          target: '.determined',
          actions: 'setFoulWinner',
        },
      },
      states: {
        opening: {
          on: {
            'pot.record': [
              {
                guard: 'isValidRespottedBlackOpeningPot',
                target: 'determined',
                actions: 'applyRespottedBlackPot',
              },
              {
                target: 'determined',
                actions: 'setRespottedBlackOpeningFoulWinner',
              },
            ],
            'miss.record': {
              target: 'play',
            },
          },
        },

        play: {
          on: {
            'pot.record': {
              target: 'determined',
              actions: 'applyRespottedBlackPot',
            },
          },
        },

        determined: {
          type: 'final',
        },
      },
    },

    'winner-determined': {
      on: {
        'pot.record': [
          {
            target: 'winner-determined',
            actions: 'applyWinnerDeterminedPot',
          },
        ],
        'frame.award': {
          target: 'frame-over',
        },
      },
    },

    'frame-over': {
      type: 'final',
    },
  },

  on: {
    'frame.concede': {
      guard: 'canConcede',
      target: '.winner-determined',
      actions: 'setConcedeWinner',
    },
  },

  output: ({ context }) => ({
    winner: context.winner!,
    winReason: context.winReason!,
    score: context.score,
  }),
})

export type StrilaSparringSnapshot = SnapshotFrom<typeof strilaSparringMachine>
export type StrilaSparringOutput = {
  winner: StrilaSeat
  winReason: StrilaWinReason
  score: { A: number; B: number }
}

export function createInitialSnapshot(targetPointsBySeat?: { A: number; B: number }): StrilaSparringSnapshot {
  return getInitialSnapshot(strilaSparringMachine, { targetPointsBySeat: targetPointsBySeat ?? { A: 9, B: 9 } })
}

export function getPhase(snapshot: StrilaSparringSnapshot): StrilaPhase {
  const value = snapshot.value
  if (typeof value === 'string') return value as StrilaPhase

  if ('foul-committed' in value) {
    return `foul-committed.${value['foul-committed']}` as StrilaPhase
  }

  if ('respotted-black' in value) {
    return `respotted-black.${value['respotted-black']}` as StrilaPhase
  }

  throw new Error(`Unknown Strila phase: ${JSON.stringify(value)}`)
}

export function sendEvent(snapshot: StrilaSparringSnapshot, event: StrilaEvent): StrilaSparringSnapshot {
  if (event.type === 'pot.record') {
    for (const ball of event.pottedBalls) {
      if (ball !== 0 && !snapshot.context.coloredBallsOnTable.includes(ball)) {
        throw new Error(`Potted ball ${ball} is not on the table`)
      }
    }
  }
  return getNextSnapshot(strilaSparringMachine, snapshot, event)
}
