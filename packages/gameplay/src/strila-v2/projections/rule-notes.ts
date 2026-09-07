import { type Seat } from '@ks/core'
import invariant from 'tiny-invariant'

import { type StrilaGamePresentationDetails, StrilaMeta } from '../definitions'
import { getPhase, sendEvent, type StrilaSparringFrameSnapshot } from '../machine'

export function deriveStrilaRuleNotes(
  snapshot: StrilaSparringFrameSnapshot,
): StrilaGamePresentationDetails['ruleNotes'] {
  const ruleNotes: StrilaGamePresentationDetails['ruleNotes'][number][] = []

  switch (getPhase(snapshot)) {
    case 'foul-committed.penalty-selection':
      ruleNotes.push({ severity: 'warning', code: 'manual-foul-cue-ball-response' })
      break
    case 'foul-committed.ball-in-hand':
      ruleNotes.push({ severity: 'warning', code: 'cue-ball-and-colored-is-foul' })
      break
    case 'respotted-black.opening':
      ruleNotes.push({ severity: 'info', code: 'respotted-black-opening' })
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
 * Combined cue-and-colored pots are included only when the machine gives them a different result.
 */
function lastColoredBallRuleNotes(
  snapshot: StrilaSparringFrameSnapshot,
): StrilaGamePresentationDetails['ruleNotes'] {
  const phase = getPhase(snapshot)
  // Other phases either use respotted-black rules or no longer offer ordinary pot controls.
  if (
    snapshot.context.coloredBallsOnTable.length !== 1 ||
    (phase !== 'open-play' && phase !== 'foul-committed.ball-in-hand')
  )
    return []

  const ball = snapshot.context.coloredBallsOnTable[0]
  invariant(ball !== undefined, 'A last-colored-ball projection must have a colored ball')
  const projectedOutcome = (seat: Seat, shot: 'colored-ball' | 'cue-and-colored-ball') => {
    const candidate = sendEvent(snapshot, {
      type: 'pot.record',
      seat,
      pottedBalls: shot === 'colored-ball' ? [ball] : [StrilaMeta.cueBall, ball],
    })
    const phase = getPhase(candidate)
    if (phase === 'respotted-black.opening') {
      return { seat, shot, result: { type: 'respotted-black' as const } }
    }
    if (phase !== 'winner-determined') return null
    invariant(candidate.context.winner !== null, 'A determined last-colored-ball pot must have a winner')
    return {
      seat,
      shot,
      result: { type: 'winner-determined' as const, winnerSeat: candidate.context.winner },
    }
  }
  const outcomes = (['A', 'B'] as const).flatMap((seat) => {
    const coloredBall = projectedOutcome(seat, 'colored-ball')
    invariant(coloredBall !== null, 'A last colored ball must determine the next frame phase')
    const cueAndColoredBall = projectedOutcome(seat, 'cue-and-colored-ball')
    const sameResult =
      cueAndColoredBall === null ||
      (cueAndColoredBall.result.type === coloredBall.result.type &&
        (cueAndColoredBall.result.type !== 'winner-determined' ||
          (coloredBall.result.type === 'winner-determined' &&
            cueAndColoredBall.result.winnerSeat === coloredBall.result.winnerSeat)))
    return sameResult ? [coloredBall] : [coloredBall, cueAndColoredBall]
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
