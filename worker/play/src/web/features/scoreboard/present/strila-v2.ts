import type { Seat } from '@ks/core'
import { type StrilaGamePresentation, StrilaMeta } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

import {
  FRAMES_CENTRE_SIZE,
  framesCentre,
  handicapTargets,
  NO_TIPS,
  pointDigits,
  type ScoreboardPresenter,
} from '@/features/scoreboard/present/shared'
import type { ScoreboardTip } from '@/features/scoreboard/values'

/**
 * Strila: a frame race with the ball row and viewer tips while a frame is active. Finished and
 * between-frames reads carry no ball statuses, so the ball row's space stays empty.
 */
export const strilaV2: ScoreboardPresenter = {
  size: (gameKey) => ({ ballRow: true, pointChars: pointDigits(gameKey), centre: FRAMES_CENTRE_SIZE }),
  present: (read, t) => {
    const details =
      read.lifecycle === 'active' && read.game?.gameKey === 'strila-v2' ? read.game.details : null

    return {
      targets: handicapTargets(read, t),
      centre: framesCentre(read),
      balls: details
        ? StrilaMeta.allBalls.map((ball) => ({ ball, status: details.ballStatuses[ball] }))
        : null,
      tips: details ? viewerTips(details.ruleNotes, t) : NO_TIPS,
    }
  },
}

type RuleNote = StrilaGamePresentation['details']['ruleNotes'][number]

/**
 * Only notes that concern one seat and help a viewer follow play. Operator instructions
 * (`manual-foul-cue-ball-response`, `cue-ball-and-colored-is-foul`) and seatless respotted-black
 * notes stay off stream; the centre of the secondary row is reserved for frame history.
 */
function viewerTips(notes: readonly RuleNote[], t: TFunction) {
  // One line fits under a name. The last-ball outcome decides the frame, so it outranks the
  // third-cue-ball warning.
  const tips = notes
    .flatMap((note) => seatTips(note, t))
    .sort((a, b) => Number(b.tip.kind !== 'third-cue-ball-pot') - Number(a.tip.kind !== 'third-cue-ball-pot'))

  const first = (seat: Seat) => tips.find((entry) => entry.seat === seat)?.tip ?? null

  return { A: first('A'), B: first('B') }
}

function seatTips(note: RuleNote, t: TFunction): readonly { seat: Seat; tip: ScoreboardTip }[] {
  switch (note.code) {
    case 'third-consecutive-cue-ball-pot':
      return [
        {
          seat: note.seat,
          tip: { kind: 'third-cue-ball-pot', text: t(keys.scoreboard.tips.thirdCueBallPot) },
        },
      ]
    case 'last-colored-ball-pot-outcomes':
      return note.outcomes.map(({ seat, result }) => {
        const kind =
          result.type === 'respotted-black'
            ? 'pot-ties-frame'
            : result.winnerSeat === seat
              ? 'frame-ball'
              : 'pot-loses-frame'

        return {
          seat,
          tip: {
            kind,
            ball: note.ball,
            text: t(TIP_COPY[kind], { ball: t(`scoreboard.balls.${note.ball}`) }),
          },
        }
      })
    case 'manual-foul-cue-ball-response':
    case 'cue-ball-and-colored-is-foul':
    case 'respotted-black-opening-toss':
    case 'respotted-black-opening':
      return []
  }

  return []
}

const TIP_COPY = {
  'frame-ball': keys.scoreboard.tips.frameBall,
  'pot-ties-frame': keys.scoreboard.tips.potTiesFrame,
  'pot-loses-frame': keys.scoreboard.tips.potLosesFrame,
} as const
