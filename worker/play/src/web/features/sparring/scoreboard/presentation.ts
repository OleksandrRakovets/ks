import type { ReadMatchResult } from '@ks/application'
import type { MatchId, Seat } from '@ks/core'
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

/**
 * A game's fixed artwork size: whether it has a ball row and the widest numbers it can show.
 * It depends only on the game, so each layout and game keep one box in every state.
 */
export type ScoreboardSize = Readonly<{
  ballRow: boolean
  /** Characters in the per-seat points boxes, minus sign included. */
  pointChars: number
  /** The widest centre the game can show: its kind and the digits of its race or target. */
  centre: Readonly<{ kind: 'frames' | 'target'; digits: number }>
}>

/**
 * The centre between the points boxes: frames won around the race (`1 (3) 2`), a match to points'
 * bare target, or a separator (`8 : 4`) when per-seat targets leave no single target to show.
 */
export type ScoreboardCentre = Readonly<
  | { kind: 'frames'; A: number; B: number; race: number }
  | { kind: 'target'; target: number }
  | { kind: 'separator' }
>

/** Resolved values for the scoreboard artwork; the artwork derives nothing from a match read. */
export type ScoreboardValues =
  | { readonly kind: 'empty'; readonly matchId: MatchId; readonly size: ScoreboardSize }
  | {
      readonly kind: 'match'
      readonly matchId: MatchId
      readonly size: ScoreboardSize
      readonly seq: number
      readonly names: { readonly A: string; readonly B: string }
      /** Set once the match is finished; the artwork keeps showing the final state. */
      readonly winnerSeat: Seat | null
      /** Current points with a typographic minus: frame points, or the match score in a match to points. */
      readonly points: { readonly A: string; readonly B: string }
      /**
       * Per-seat point targets, shown under the points when they differ from the game's default,
       * with a label under a frames centre.
       */
      readonly targets: { readonly A: number; readonly B: number; readonly label: string | null } | null
      readonly centre: ScoreboardCentre
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
  scoreboard: {
    gameKey: GameKey
    matchId: MatchId
    read: ReadMatchResult<GameKey>
    /** `short` replaces each first name with its initial. */
    names: 'full' | 'short'
  },
  t: TFunction,
): ScoreboardValues {
  const { matchId, read } = scoreboard
  const size = scoreboardSize(scoreboard.gameKey)

  if (!read.ok) return { kind: 'empty', matchId, size }

  const name = (seat: Seat) =>
    scoreboard.names === 'short'
      ? read.participants[seat].shortDisplayName
      : read.participants[seat].displayName

  const defaults = registry[read.gameKey].meta.defaultFrameTargetPointsBySeat
  const configured = read.targets.frameTargetPointsBySeat
  const isDefaultTarget = configured.A === defaults.A && configured.B === defaults.B
  const framePoints = read.representedFrame?.pointsBySeat ?? { A: 0, B: 0 }
  const strila = read.lifecycle === 'active' && read.game?.gameKey === 'strila-v2' ? read.game.details : null

  // Long pyramid is a single frame to points: its points are the match score, and an equal target
  // shows alone in the centre, even the default. Lopsided targets go under the points instead.
  const toPoints = read.gameKey === 'free-pyramid-long'
  const equalTargets = configured.A === configured.B
  const showTargets = toPoints ? !equalTargets : !isDefaultTarget

  return {
    kind: 'match',
    matchId,
    size,
    seq: read.latestSeq,
    names: { A: name('A'), B: name('B') },
    winnerSeat: read.winnerSeat,
    points: { A: signed(framePoints.A), B: signed(framePoints.B) },
    // A separator centre spans both rows, leaving no room for the label.
    targets: showTargets ? { ...configured, label: toPoints ? null : t(keys.scoreboard.handicap) } : null,
    centre: toPoints
      ? equalTargets
        ? { kind: 'target', target: configured.A }
        : { kind: 'separator' }
      : { kind: 'frames', ...read.framesWonBySeat, race: read.targets.matchTargetFrames },
    balls: strila ? StrilaMeta.allBalls.map((ball) => ({ ball, status: strila.ballStatuses[ball] })) : null,
    tips: strila ? viewerTips(strila.ruleNotes, t) : { A: null, B: null },
  }
}

/** Setup allows races up to 20 frames. */
const RACE_DIGITS = 2

function scoreboardSize(gameKey: GameKey): ScoreboardSize {
  // A frame can end on a pot past its target, so allow points up to twice the largest setup target.
  const pointDigits = digits(2 * registry[gameKey].meta.maxFrameTargetPoints)

  // Long pyramid's centre holds at most its target, as wide as its points. Old-rules fouls can take
  // a player below zero, so its points boxes also fit a minus sign.
  return gameKey === 'free-pyramid-long'
    ? { ballRow: false, pointChars: pointDigits, centre: { kind: 'target', digits: pointDigits } }
    : {
        ballRow: gameKey === 'strila-v2',
        pointChars: pointDigits + (gameKey === 'combined-pyramid-old' ? 1 : 0),
        centre: { kind: 'frames', digits: RACE_DIGITS },
      }
}

function digits(value: number) {
  return String(Math.abs(value)).length
}

/** U+2212 MINUS SIGN, which matches the digits' width and height unlike a hyphen. */
function signed(points: number) {
  return points < 0 ? `\u2212${-points}` : String(points)
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
