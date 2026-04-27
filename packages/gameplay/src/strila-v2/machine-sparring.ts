import { assign, getInitialSnapshot, getNextSnapshot, setup, type SnapshotFrom } from 'xstate'

import {
  STRILA_COLORED_BALLS,
  type StrilaColoredBall,
  type StrilaContext,
  type StrilaEvent,
  type StrilaPhase,
  type StrilaSeat,
  type StrilaWinReason,
} from './definitions2'

function opponentOf(seat: StrilaSeat): StrilaSeat {
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

function nextCueBallStreak(prev: 0 | 1 | 2, pottedBalls: (0 | StrilaColoredBall)[]): 0 | 1 | 2 {
  if (!pottedBalls.includes(0)) return 0
  return prev >= 2 ? 2 : ((prev + 1) as 0 | 1 | 2)
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
      return context.cueBallPotsInRun >= 2 && e.pottedBalls.includes(0)
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
      return next.A >= context.targetPointsBySeat.A || next.B >= context.targetPointsBySeat.B
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
  },
  actions: {
    applyPot: assign(({ context, event }) => {
      const e = event as PotEvent
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        actor: e.actor,
        cueBallPotsInRun: nextCueBallStreak(context.cueBallPotsInRun, e.pottedBalls),
      }
    }),
    applyPotResetStreak: assign(({ context, event }) => {
      const e = event as PotEvent
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        actor: e.actor,
        cueBallPotsInRun: (e.pottedBalls.includes(0) ? 1 : 0) as 0 | 1 | 2,
      }
    }),
    applyRespottedBlackPot: assign(({ context, event }) => {
      const e = event as PotEvent
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: [] as StrilaColoredBall[],
        actor: e.actor,
        winner: e.actor,
        winReason: 'respotted-black-won' as const,
      }
    }),
    setWinnerFromTarget: assign(({ context }) => ({
      winner: (context.score.A >= context.targetPointsBySeat.A ? 'A' : 'B') as StrilaSeat,
      winReason: 'target-reached' as const,
    })),
    setRespottedBlackOpening: assign({
      coloredBallsOnTable: [7] as StrilaColoredBall[],
    }),
    setFoulResponse: assign(({ event }) => {
      const e = event as PotEvent | Extract<StrilaEvent, { type: 'foul.commit' }>
      return {
        chooser: opponentOf(e.actor),
        offender: e.actor,
      }
    }),
    setRespottedBlackOpeningFoulWinner: assign(({ event }) => {
      const e = event as PotEvent
      return {
        coloredBallsOnTable: [7] as StrilaColoredBall[],
        winner: opponentOf(e.actor),
        actor: opponentOf(e.actor),
        winReason: 'automatic-foul' as const,
      }
    }),
    setFoulWinner: assign(({ event }) => {
      const e = event as Extract<StrilaEvent, { type: 'foul.commit' }>
      return {
        winner: opponentOf(e.actor),
        actor: opponentOf(e.actor),
        winReason: 'automatic-foul' as const,
      }
    }),
    setConcedeWinner: assign(({ event }) => {
      const e = event as Extract<StrilaEvent, { type: 'frame.concede' }>
      return {
        winner: opponentOf(e.actor),
        actor: opponentOf(e.actor),
        winReason: 'conceded' as const,
      }
    }),
    setPenaltyConcedeWinner: assign(({ context, event }) => {
      const e = event as Extract<StrilaEvent, { type: 'frame.concede' }>
      const winner = context.offender !== null && e.actor === context.offender ? context.chooser! : context.offender!
      return {
        winner,
        actor: winner,
        winReason: 'conceded' as const,
      }
    }),
    applyBallInHand: assign(({ event }) => {
      const e = event as Extract<StrilaEvent, { type: 'penalty.select' }>
      return {
        actor: e.actor as StrilaSeat,
        chooser: null as StrilaSeat | null,
        offender: null as StrilaSeat | null,
      }
    }),
    applyPlayFromPosition: assign(({ context, event }) => {
      const e = event as Extract<StrilaEvent, { type: 'penalty.select' }>
      return {
        score: addPoints(context.score, e.actor, 1),
        actor: e.actor as StrilaSeat,
        cueBallPotsInRun: 0 as const,
        chooser: null as StrilaSeat | null,
        offender: null as StrilaSeat | null,
      }
    }),
    applyPassPosition: assign(({ context, event }) => {
      const e = event as Extract<StrilaEvent, { type: 'penalty.select' }>
      return {
        score: addPoints(context.score, e.actor, 1),
        actor: context.offender!,
        cueBallPotsInRun: 0 as const,
        chooser: null as StrilaSeat | null,
        offender: null as StrilaSeat | null,
      }
    }),
    switchToOpponent: assign(({ event }) => {
      const e = event as Extract<StrilaEvent, { type: 'miss.record' }>
      return {
        actor: opponentOf(e.actor),
        cueBallPotsInRun: 0 as const,
      }
    }),
    switchToOpponentOfPhaseActor: assign(({ context }) => ({
      actor: opponentOf(context.actor!),
    })),
    applyWinnerDeterminedPot: assign(({ context, event }) => {
      const e = event as PotEvent
      return {
        score: addPoints(context.score, e.actor, pointsForPottedBalls(e.pottedBalls)),
        coloredBallsOnTable: removePottedColoredBalls(context.coloredBallsOnTable, e.pottedBalls),
        actor: e.actor,
      }
    }),
    commence: assign(({ event }) => {
      const e = event as Extract<StrilaEvent, { type: 'frame.commence' }>
      return {
        actor: e.actor,
        score: { A: 0, B: 0 },
        coloredBallsOnTable: [...STRILA_COLORED_BALLS] as StrilaColoredBall[],
        cueBallPotsInRun: 0 as const,
      }
    }),
  },
}).createMachine({
  id: 'strila-sparring',
  initial: 'not-started',
  context: ({ input }) => ({
    score: { A: 0, B: 0 },
    targetPointsBySeat: input?.targetPointsBySeat ?? { A: 9, B: 9 },
    coloredBallsOnTable: [...STRILA_COLORED_BALLS] as StrilaColoredBall[],
    actor: null,
    cueBallPotsInRun: 0 as const,
    chooser: null,
    offender: null,
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
            target: 'penalty-selection',
            actions: 'setFoulResponse',
          },
          {
            guard: 'isTargetReachedAfterPot',
            target: 'winner-determined',
            actions: ['applyPot', 'setWinnerFromTarget'],
          },
          {
            guard: 'isRespottedBlackTrigger',
            target: 'respotted-black-opening',
            actions: ['applyPot', 'setRespottedBlackOpening'],
          },
          {
            target: 'open-play',
            actions: 'applyPot',
          },
        ],
        'foul.commit': {
          target: 'penalty-selection',
          actions: 'setFoulResponse',
        },
        'frame.concede': {
          target: 'winner-determined',
          actions: 'setConcedeWinner',
        },
      },
    },

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
            target: 'open-play',
            actions: 'applyPlayFromPosition',
          },
          {
            guard: 'isPassPositionChoice',
            target: 'open-play',
            actions: 'applyPassPosition',
          },
        ],
        'frame.concede': {
          target: 'winner-determined',
          actions: 'setPenaltyConcedeWinner',
        },
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
            target: 'winner-determined',
            actions: ['applyPotResetStreak', 'setWinnerFromTarget'],
          },
          {
            guard: 'isRespottedBlackTrigger',
            target: 'respotted-black-opening',
            actions: ['applyPotResetStreak', 'setRespottedBlackOpening'],
          },
          {
            target: 'open-play',
            actions: 'applyPotResetStreak',
          },
        ],
        'miss.record': {
          target: 'open-play',
          actions: 'switchToOpponent',
        },
        'foul.commit': {
          target: 'penalty-selection',
          actions: 'setFoulResponse',
        },
        'frame.concede': {
          target: 'winner-determined',
          actions: 'setConcedeWinner',
        },
      },
    },

    'respotted-black-opening': {
      on: {
        'pot.record': [
          {
            guard: 'isValidRespottedBlackOpeningPot',
            target: 'winner-determined',
            actions: 'applyRespottedBlackPot',
          },
          {
            target: 'winner-determined',
            actions: 'setRespottedBlackOpeningFoulWinner',
          },
        ],
        'miss.record': {
          target: 'respotted-black-play',
          actions: 'switchToOpponentOfPhaseActor',
        },
        'foul.commit': {
          target: 'winner-determined',
          actions: 'setFoulWinner',
        },
        'frame.concede': {
          target: 'winner-determined',
          actions: 'setConcedeWinner',
        },
      },
    },

    'respotted-black-play': {
      on: {
        'pot.record': {
          target: 'winner-determined',
          actions: 'applyRespottedBlackPot',
        },
        'foul.commit': {
          target: 'winner-determined',
          actions: 'setFoulWinner',
        },
        'frame.concede': {
          target: 'winner-determined',
          actions: 'setConcedeWinner',
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
  return snapshot.value as StrilaPhase
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
