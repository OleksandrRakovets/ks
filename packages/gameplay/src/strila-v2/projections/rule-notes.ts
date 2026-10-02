import { type Seat } from '@ks/core'
import invariant from 'tiny-invariant'

import { type StrilaGamePresentationDetails } from '../definitions'
import { getPhase, sendEvent, type StrilaFrameSnapshot } from '../machine'

type Seat = typeof Seat.Type

type StrilaGamePresentationDetails = typeof StrilaGamePresentationDetails.Type

export function deriveStrilaRuleNotes(
  snapshot: StrilaFrameSnapshot,
): StrilaGamePresentationDetails['ruleNotes'] {
  const ruleNotes: StrilaGamePresentationDetails['ruleNotes'][number][] = []

  switch (getPhase(snapshot)) {
    case 'foul-committed.penalty-selection':
      ruleNotes.push({ severity: 'warning', code: 'manual-foul-cue-ball-response' })
      break
    case 'foul-committed.ball-in-hand':
      ruleNotes.push({ severity: 'warning', code: 'cue-ball-and-colored-is-foul' })
      break
    case 'respotted-black.opening-selection':
      ruleNotes.push({ severity: 'info', code: 'respotted-black-opening-toss' })
      break
    case 'respotted-black.opening':
      ruleNotes.push({ severity: 'info', code: 'respotted-black-opening' })
      break
    case 'frame-over':
    case 'not-started':
    case 'open-play':
    case 'respotted-black.play':
    case 'winner-determined':
      break
  }

  if (snapshot.context.cueBallSerialPots?.count === 2) {
    ruleNotes.push({
      severity: 'warning',
      code: 'third-consecutive-cue-ball-pot',
      seat: snapshot.context.cueBallSerialPots.seat,
    })
  }

  ruleNotes.push(...lastColoredBallRuleNotes(snapshot))

  return normalizeRuleNotes(ruleNotes)
}

function normalizeRuleNotes(entries: StrilaGamePresentationDetails['ruleNotes']) {
  const seen = new Set<string>()

  return [...entries]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1))
    .filter((entry) => {
      const key = `${entry.severity}:${entry.code}`

      if (seen.has(key)) return false
      seen.add(key)

      return true
    })
}

/**
 * Projects the possible frame consequences of potting the sole remaining colored ball.
 */
function lastColoredBallRuleNotes(snapshot: StrilaFrameSnapshot): StrilaGamePresentationDetails['ruleNotes'] {
  const phase = getPhase(snapshot)

  // Other phases either use respotted-black rules or no longer offer ordinary pot controls.
  if (
    snapshot.context.coloredBallsOnTable.length !== 1 ||
    (phase !== 'open-play' && phase !== 'foul-committed.ball-in-hand')
  )
    return []

  const ball = snapshot.context.coloredBallsOnTable[0]
  invariant(ball !== undefined, 'A last-colored-ball projection must have a colored ball')

  const projectedOutcome = (seat: Seat) => {
    const candidate = sendEvent(snapshot, {
      type: 'pot.record',
      seat,
      pottedBalls: [ball],
    })

    const phase = getPhase(candidate)

    if (phase === 'respotted-black.opening-selection') {
      return { seat, result: { type: 'respotted-black' as const } }
    }

    if (phase !== 'winner-determined') return null
    invariant(candidate.context.winner !== null, 'A determined last-colored-ball pot must have a winner')

    return {
      seat,
      result: { type: 'winner-determined' as const, winnerSeat: candidate.context.winner },
    }
  }

  const outcomes = (['A', 'B'] as const).map((seat) => {
    const outcome = projectedOutcome(seat)
    invariant(outcome !== null, 'A last colored ball must determine the next frame phase')

    return outcome
  })

  return (['warning', 'info'] as const).flatMap((severity) => {
    const matching = outcomes.filter(
      ({ seat, result }) =>
        (result.type === 'winner-determined' && result.winnerSeat !== seat) === (severity === 'warning'),
    )

    return matching.length === 0
      ? []
      : [{ severity, code: 'last-colored-ball-pot-outcomes' as const, ball, outcomes: matching }]
  })
}
