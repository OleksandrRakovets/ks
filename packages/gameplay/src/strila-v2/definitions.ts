import { BySeatNumber, GameProtocolEntry, NonEmptyString, Seat } from '@ks/core'
import * as v from 'valibot'

import { FoulCommitCommand, FrameAwardCommand, FrameCommenceCommand } from '../command-schemas'
import { GamePresentation } from '../constants'

const CueBall = v.literal(0)

const ColoredBall = v.union([
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6),
  v.literal(7),
])

export type StrilaColoredBall = v.InferOutput<typeof ColoredBall>

const COLORED_BALLS: readonly StrilaColoredBall[] = [1, 2, 3, 4, 5, 6, 7]

const Ball = v.union([CueBall, ColoredBall])

export type StrilaBall = v.InferOutput<typeof Ball>

const BALLS: readonly StrilaBall[] = [0, ...COLORED_BALLS]

const PottedBalls = v.pipe(
  v.array(Ball),
  v.minLength(1),
  v.check((balls) => new Set(balls).size === balls.length, 'Potted balls must be unique'),
  v.readonly(),
)

export const StrilaMeta = {
  allBalls: BALLS,
  coloredBalls: COLORED_BALLS,
  cueBall: CueBall.literal,
  defaultTargetPoints: { A: 9, B: 9 },
} as const

const FoulResponseChoice = v.picklist(['play-from-position', 'pass-position', 'ball-in-hand'])

export const StrilaCommand = v.variant('type', [
  FrameCommenceCommand,
  v.pipe(v.strictObject({ type: v.literal('respotted-black.opening.select'), seat: Seat }), v.readonly()),
  v.pipe(
    v.strictObject({ type: v.literal('pot.record'), seat: Seat, pottedBalls: PottedBalls }),
    v.readonly(),
  ),
  v.pipe(v.strictObject({ type: v.literal('miss.record'), seat: Seat }), v.readonly()),
  FoulCommitCommand,
  v.pipe(
    v.strictObject({ type: v.literal('penalty.select'), seat: Seat, choice: FoulResponseChoice }),
    v.readonly(),
  ),
  FrameAwardCommand,
])

export type StrilaCommand = v.InferOutput<typeof StrilaCommand>

export const StrilaPhase = v.picklist([
  'not-started',
  'open-play',
  'foul-committed.penalty-selection',
  'foul-committed.ball-in-hand',
  'respotted-black.opening-selection',
  'respotted-black.opening',
  'respotted-black.play',
  'winner-determined',
  'frame-over',
])

export type StrilaPhase = v.InferOutput<typeof StrilaPhase>

const WinnerDeterminationReason = v.picklist([
  'target-reached',
  'table-cleared',
  'respotted-black-won',
  'automatic-foul',
])

const PottedBallsBySeat = v.pipe(
  v.object({
    A: v.pipe(v.array(Ball), v.readonly()),
    B: v.pipe(v.array(Ball), v.readonly()),
  }),
  v.readonly(),
)

export const StrilaContext = v.pipe(
  v.object({
    score: BySeatNumber,
    targetPoints: BySeatNumber,
    coloredBallsOnTable: v.pipe(v.array(ColoredBall), v.readonly()),
    pottedBallsBySeat: PottedBallsBySeat,
    cueBallSerialPots: v.nullable(
      v.pipe(
        v.object({
          seat: Seat,
          count: v.union([v.literal(1), v.literal(2)]),
        }),
        v.readonly(),
      ),
    ),
    foulOffender: v.nullable(Seat),
    respottedBlackOpeningSeat: v.nullable(Seat),
    winner: v.nullable(Seat),
    winnerDeterminationReason: v.nullable(WinnerDeterminationReason),
    continuationAllowed: v.boolean(),
  }),
  v.readonly(),
)

export type StrilaContext = v.InferOutput<typeof StrilaContext>

export const FoulSnapshotValue = v.strictObject({
  'foul-committed': v.picklist(['penalty-selection', 'ball-in-hand']),
})

export const RespottedBlackSnapshotValue = v.strictObject({
  'respotted-black': v.picklist(['opening-selection', 'opening', 'play']),
})

export const StrilaSnapshotValue = v.union([
  v.picklist(['not-started', 'open-play', 'winner-determined', 'frame-over']),
  FoulSnapshotValue,
  RespottedBlackSnapshotValue,
])

export const StrilaCheckpoint = v.object({ value: StrilaSnapshotValue, context: StrilaContext })

export type StrilaCheckpoint = v.InferOutput<typeof StrilaCheckpoint>

const BallStatus = v.picklist(['object', 'on-table', 'potted'])

export const StrilaBallStatuses = v.pipe(
  v.object({
    0: BallStatus,
    1: BallStatus,
    2: BallStatus,
    3: BallStatus,
    4: BallStatus,
    5: BallStatus,
    6: BallStatus,
    7: BallStatus,
  }),
  v.readonly(),
)

export type StrilaBallStatuses = v.InferOutput<typeof StrilaBallStatuses>

const LastColoredBallPotOutcome = v.pipe(
  v.object({
    seat: Seat,
    result: v.variant('type', [
      v.pipe(v.object({ type: v.literal('winner-determined'), winnerSeat: Seat }), v.readonly()),
      v.pipe(v.object({ type: v.literal('respotted-black') }), v.readonly()),
    ]),
  }),
  v.readonly(),
)

const StrilaRuleNote = v.variant('code', [
  v.pipe(
    v.object({ severity: v.literal('warning'), code: v.literal('cue-ball-and-colored-is-foul') }),
    v.readonly(),
  ),
  v.pipe(
    v.object({ severity: v.literal('warning'), code: v.literal('manual-foul-cue-ball-response') }),
    v.readonly(),
  ),
  v.pipe(
    v.object({
      severity: v.literal('warning'),
      code: v.literal('third-consecutive-cue-ball-pot'),
      seat: Seat,
    }),
    v.readonly(),
  ),
  v.pipe(
    v.object({ severity: v.literal('info'), code: v.literal('respotted-black-opening-toss') }),
    v.readonly(),
  ),
  v.pipe(v.object({ severity: v.literal('info'), code: v.literal('respotted-black-opening') }), v.readonly()),
  v.pipe(
    v.object({
      severity: v.picklist(['warning', 'info']),
      code: v.literal('last-colored-ball-pot-outcomes'),
      ball: ColoredBall,
      outcomes: v.pipe(v.array(LastColoredBallPotOutcome), v.minLength(1), v.readonly()),
    }),
    v.readonly(),
  ),
])

type StrilaRuleNote = v.InferOutput<typeof StrilaRuleNote>

const StrilaGamePresentationDetails = v.pipe(
  v.object({
    phase: StrilaPhase,
    seat: v.optional(Seat),
    situationTitle: NonEmptyString,
    situationSummary: v.optional(NonEmptyString),
    isBallSetVisible: v.boolean(),
    isPotCommandAvailable: v.boolean(),
    ballStatuses: StrilaBallStatuses,
    pottedBallsBySeat: PottedBallsBySeat,
    ruleNotes: v.pipe(v.array(StrilaRuleNote), v.readonly()),
  }),
  v.readonly(),
)

export type StrilaGamePresentationDetails = v.InferOutput<typeof StrilaGamePresentationDetails>

export const StrilaGamePresentation = v.pipe(
  v.object({
    ...GamePresentation.entries,
    gameKey: v.literal('strila-v2'),
    score: BySeatNumber,
    details: StrilaGamePresentationDetails,
  }),
  v.readonly(),
)

export type StrilaGamePresentation = v.InferOutput<typeof StrilaGamePresentation>

const AutomaticFoulReason = v.picklist([
  'third-consecutive-cue-ball-pot',
  'illegal-ball-in-hand-pot',
  'respotted-black-opening-illegal-pot',
])

const StrilaPlayerProtocolEntryBody = v.variant('commandType', [
  v.pipe(v.strictObject({ commandType: v.literal('frame.commence') }), v.readonly()),
  v.pipe(v.strictObject({ commandType: v.literal('respotted-black.opening.select') }), v.readonly()),
  v.pipe(v.strictObject({ commandType: v.literal('pot.record'), pottedBalls: PottedBalls }), v.readonly()),
  v.pipe(v.strictObject({ commandType: v.literal('miss.record') }), v.readonly()),
  v.pipe(v.strictObject({ commandType: v.literal('foul.commit') }), v.readonly()),
  v.pipe(
    v.strictObject({ commandType: v.literal('penalty.select'), choice: FoulResponseChoice }),
    v.readonly(),
  ),
  v.pipe(v.strictObject({ commandType: v.literal('frame.award') }), v.readonly()),
])

const StrilaSystemProtocolEntryBody = v.variant('systemType', [
  v.pipe(
    v.strictObject({ systemType: v.literal('automatic-foul'), reason: AutomaticFoulReason }),
    v.readonly(),
  ),
  v.pipe(
    v.strictObject({ systemType: v.literal('winner-determined'), reason: WinnerDeterminationReason }),
    v.readonly(),
  ),
  v.pipe(v.strictObject({ systemType: v.literal('respotted-black-declared') }), v.readonly()),
])

/** Combines the common game Protocol envelope with Strila's typed player/system body variants. */
export const StrilaProtocolEntry = v.pipe(
  v.object({
    ...GameProtocolEntry.entries,
    body: v.union([StrilaPlayerProtocolEntryBody, StrilaSystemProtocolEntryBody]),
  }),
  v.readonly(),
)

export type StrilaProtocolEntry = v.InferOutput<typeof StrilaProtocolEntry>
