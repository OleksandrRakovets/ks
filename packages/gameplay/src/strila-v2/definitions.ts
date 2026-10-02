import { BySeatNumber, NonEmptyString, Seat, StrictStruct } from '@ks/core'
import { Schema } from 'effect'

import {
  FoulCommitCommand,
  FrameAwardCommand,
  FrameCommenceCommand,
  GamePresentation,
  GameProtocolEntryFields,
} from '../constants'

const CueBall = Schema.Literal(0)

export const StrilaColoredBall = Schema.Literals([1, 2, 3, 4, 5, 6, 7])

const COLORED_BALLS: readonly (typeof StrilaColoredBall.Type)[] = [1, 2, 3, 4, 5, 6, 7]

export const StrilaBall = Schema.Union([CueBall, StrilaColoredBall])

const BALLS: readonly (typeof StrilaBall.Type)[] = [0, ...COLORED_BALLS]

const PottedBalls = Schema.Array(StrilaBall).check(
  Schema.isMinLength(1),
  Schema.isUnique({ message: 'Potted balls must be unique' }),
)

export const StrilaMeta = {
  allBalls: BALLS,
  coloredBalls: COLORED_BALLS,
  cueBall: CueBall.literal,
  defaultTargetPoints: { A: 9, B: 9 },
} as const

const FoulResponseChoice = Schema.Literals(['play-from-position', 'pass-position', 'ball-in-hand'])

export const StrilaCommand = Schema.Union([
  FrameCommenceCommand,
  StrictStruct({ type: Schema.Literal('respotted-black.opening.select'), seat: Seat }),
  StrictStruct({ type: Schema.Literal('pot.record'), seat: Seat, pottedBalls: PottedBalls }),
  StrictStruct({ type: Schema.Literal('miss.record'), seat: Seat }),
  FoulCommitCommand,
  StrictStruct({ type: Schema.Literal('penalty.select'), seat: Seat, choice: FoulResponseChoice }),
  FrameAwardCommand,
])

export const StrilaPhase = Schema.Literals([
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

const WinnerDeterminationReason = Schema.Literals([
  'target-reached',
  'table-cleared',
  'respotted-black-won',
  'automatic-foul',
])

const PottedBallsBySeat = Schema.Struct({
  A: Schema.Array(StrilaBall),
  B: Schema.Array(StrilaBall),
})

export const StrilaContext = Schema.Struct({
  score: BySeatNumber,
  targetPoints: BySeatNumber,
  coloredBallsOnTable: Schema.Array(StrilaColoredBall),
  pottedBallsBySeat: PottedBallsBySeat,
  cueBallSerialPots: Schema.NullOr(Schema.Struct({ seat: Seat, count: Schema.Literals([1, 2]) })),
  foulOffender: Schema.NullOr(Seat),
  respottedBlackOpeningSeat: Schema.NullOr(Seat),
  winner: Schema.NullOr(Seat),
  winnerDeterminationReason: Schema.NullOr(WinnerDeterminationReason),
  continuationAllowed: Schema.Boolean,
})

export const FoulSnapshotValue = StrictStruct({
  'foul-committed': Schema.Literals(['penalty-selection', 'ball-in-hand']),
})

export const RespottedBlackSnapshotValue = StrictStruct({
  'respotted-black': Schema.Literals(['opening-selection', 'opening', 'play']),
})

export const StrilaSnapshotValue = Schema.Union([
  Schema.Literals(['not-started', 'open-play', 'winner-determined', 'frame-over']),
  FoulSnapshotValue,
  RespottedBlackSnapshotValue,
])

export const StrilaCheckpoint = Schema.Struct({ value: StrilaSnapshotValue, context: StrilaContext })

const BallStatus = Schema.Literals(['object', 'on-table', 'potted'])

export const StrilaBallStatuses = Schema.Struct({
  0: BallStatus,
  1: BallStatus,
  2: BallStatus,
  3: BallStatus,
  4: BallStatus,
  5: BallStatus,
  6: BallStatus,
  7: BallStatus,
})

const LastColoredBallPotOutcome = Schema.Struct({
  seat: Seat,
  result: Schema.Union([
    Schema.Struct({ type: Schema.Literal('winner-determined'), winnerSeat: Seat }),
    Schema.Struct({ type: Schema.Literal('respotted-black') }),
  ]),
})

const StrilaRuleNote = Schema.Union([
  Schema.Struct({ severity: Schema.Literal('warning'), code: Schema.Literal('cue-ball-and-colored-is-foul') }),
  Schema.Struct({
    severity: Schema.Literal('warning'),
    code: Schema.Literal('manual-foul-cue-ball-response'),
  }),
  Schema.Struct({
    severity: Schema.Literal('warning'),
    code: Schema.Literal('third-consecutive-cue-ball-pot'),
    seat: Seat,
  }),
  Schema.Struct({ severity: Schema.Literal('info'), code: Schema.Literal('respotted-black-opening-toss') }),
  Schema.Struct({ severity: Schema.Literal('info'), code: Schema.Literal('respotted-black-opening') }),
  Schema.Struct({
    severity: Schema.Literals(['warning', 'info']),
    code: Schema.Literal('last-colored-ball-pot-outcomes'),
    ball: StrilaColoredBall,
    outcomes: Schema.Array(LastColoredBallPotOutcome).check(Schema.isMinLength(1)),
  }),
])

export const StrilaGamePresentationDetails = Schema.Struct({
  phase: StrilaPhase,
  seat: Schema.optional(Seat),
  situationTitle: NonEmptyString,
  situationSummary: Schema.optional(NonEmptyString),
  isBallSetVisible: Schema.Boolean,
  isPotCommandAvailable: Schema.Boolean,
  ballStatuses: StrilaBallStatuses,
  pottedBallsBySeat: PottedBallsBySeat,
  ruleNotes: Schema.Array(StrilaRuleNote),
})

export const StrilaGamePresentation = Schema.Struct({
  ...GamePresentation.fields,
  gameKey: Schema.Literal('strila-v2'),
  score: BySeatNumber,
  details: StrilaGamePresentationDetails,
})

const AutomaticFoulReason = Schema.Literals([
  'third-consecutive-cue-ball-pot',
  'illegal-ball-in-hand-pot',
  'respotted-black-opening-illegal-pot',
])

const StrilaPlayerProtocolEntryBody = Schema.Union([
  StrictStruct({ commandType: Schema.Literal('frame.commence') }),
  StrictStruct({ commandType: Schema.Literal('respotted-black.opening.select') }),
  StrictStruct({ commandType: Schema.Literal('pot.record'), pottedBalls: PottedBalls }),
  StrictStruct({ commandType: Schema.Literal('miss.record') }),
  StrictStruct({ commandType: Schema.Literal('foul.commit') }),
  StrictStruct({ commandType: Schema.Literal('penalty.select'), choice: FoulResponseChoice }),
  StrictStruct({ commandType: Schema.Literal('frame.award') }),
])

const StrilaSystemProtocolEntryBody = Schema.Union([
  StrictStruct({ systemType: Schema.Literal('automatic-foul'), reason: AutomaticFoulReason }),
  StrictStruct({
    systemType: Schema.Literal('winner-determined'),
    reason: WinnerDeterminationReason,
  }),
  StrictStruct({ systemType: Schema.Literal('respotted-black-declared') }),
])

/** Combines the common game Protocol envelope with Strila's typed player/system body variants. */
export const StrilaProtocolEntry = Schema.Union([
  Schema.Struct({
    ...GameProtocolEntryFields,
    gameKey: Schema.Literal('strila-v2'),
    entryType: Schema.Literal('player-command'),
    body: StrilaPlayerProtocolEntryBody,
  }),
  Schema.Struct({
    ...GameProtocolEntryFields,
    gameKey: Schema.Literal('strila-v2'),
    entryType: Schema.Literal('system-note'),
    body: StrilaSystemProtocolEntryBody,
  }),
])
