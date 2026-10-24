import type { ReadMatchResult } from '@ks/application'
import type { BySeatNumber, MatchId, Seat } from '@ks/core'
import {
  type GameKey,
  registry,
  type StrilaBall,
  type StrilaGamePresentation,
  StrilaMeta,
} from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { TFunction } from 'i18next'

type BallStatus = StrilaGamePresentation['details']['ballStatuses'][StrilaBall]

type StrilaRuleNote = StrilaGamePresentation['details']['ruleNotes'][number]

type LastColoredBall = Extract<StrilaRuleNote, { code: 'last-colored-ball-pot-outcomes' }>['ball']

/** Resolved values for the scoreboard artwork; the artwork derives nothing from a match read. */
export type ScoreboardValues =
  | { readonly kind: 'empty'; readonly matchId: MatchId }
  | {
      readonly kind: 'match'
      readonly matchId: MatchId
      readonly seq: number
      readonly names: { readonly A: string; readonly B: string }
      /** Set once the match is finished; the artwork keeps showing the final state. */
      readonly winnerSeat: Seat | null
      /** Current frame points, or null when the centre already shows them (a match to points). */
      readonly points: BySeatNumber | null
      /** Per-seat point targets, shown only when the configured pair is not the game's default. */
      readonly targets: BySeatNumber | null
      /** The centre group, read as `A (race) B`. A null race omits the parenthesised target. */
      readonly centre: { readonly A: number; readonly B: number; readonly race: number | null }
      /** Strila's ball row in table order, or null when there is no ball row to show. */
      readonly balls: readonly { readonly ball: StrilaBall; readonly status: BallStatus }[] | null
      /** One viewer tip under the player it concerns; a frame-deciding last-ball outcome wins. */
      readonly tips: { readonly A: ScoreboardTip | null; readonly B: ScoreboardTip | null }
    }

/** A viewer tip: its kind and ball drive the copy, which is resolved here for the artwork. */
type ScoreboardTip = Readonly<
  | { kind: 'third-cue-ball-pot'; text: string }
  | { kind: 'frame-ball' | 'pot-ties-frame' | 'pot-loses-frame'; ball: LastColoredBall; text: string }
>

/**
 * Projects a match read into scoreboard values. A missing or discarded match is empty, not an
 * error: the stream shows nothing until the URL points at a real match.
 */
export function presentScoreboard(
  matchId: MatchId,
  read: ReadMatchResult<GameKey>,
  t: TFunction,
): ScoreboardValues {
  if (!read.ok) return { kind: 'empty', matchId }

  const defaults = registry[read.gameKey].meta.defaultFrameTargetPointsBySeat
  const configured = read.targets.frameTargetPointsBySeat
  const isDefaultTarget = configured.A === defaults.A && configured.B === defaults.B
  const framePoints = read.representedFrame?.pointsBySeat ?? { A: 0, B: 0 }
  const strila = read.lifecycle === 'active' && read.game?.gameKey === 'strila-v2' ? read.game.details : null

  // Long pyramid is a single frame to points: its points are the match score, and an equal target
  // is the race. Lopsided targets cannot be one race, so they keep their per-seat slots instead.
  const toPoints = read.gameKey === 'free-pyramid-long'
  const equalTargets = configured.A === configured.B

  return {
    kind: 'match',
    matchId,
    seq: read.latestSeq,
    names: { A: read.participants.A.displayName, B: read.participants.B.displayName },
    winnerSeat: read.winnerSeat,
    points: toPoints ? null : framePoints,
    targets: isDefaultTarget || (toPoints && equalTargets) ? null : configured,
    centre: toPoints
      ? { ...framePoints, race: equalTargets ? configured.A : null }
      : { ...read.framesWonBySeat, race: read.targets.matchTargetFrames },
    balls: strila ? StrilaMeta.allBalls.map((ball) => ({ ball, status: strila.ballStatuses[ball] })) : null,
    tips: strila ? viewerTips(strila.ruleNotes, t) : { A: null, B: null },
  }
}

/**
 * Only notes that concern one seat and help a viewer follow play. Operator instructions
 * (`manual-foul-cue-ball-response`, `cue-ball-and-colored-is-foul`) and seatless respotted-black
 * notes stay off stream; the centre of the secondary row is reserved for frame history.
 */
function viewerTips(notes: readonly StrilaRuleNote[], t: TFunction) {
  // One line fits under a name. The last-ball outcome decides the frame, so it outranks the
  // third-cue-ball warning.
  const tips = notes
    .flatMap((note) => seatTips(note, t))
    .sort((a, b) => Number(b.tip.kind !== 'third-cue-ball-pot') - Number(a.tip.kind !== 'third-cue-ball-pot'))

  const first = (seat: Seat) => tips.find((entry) => entry.seat === seat)?.tip ?? null

  return { A: first('A'), B: first('B') }
}

function seatTips(note: StrilaRuleNote, t: TFunction): readonly { seat: Seat; tip: ScoreboardTip }[] {
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
