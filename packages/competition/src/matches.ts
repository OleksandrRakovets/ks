import {
  GameConfigurationSchema,
  type GameKey,
  type MatchConfig,
  type MatchId,
  MatchIdSchema,
  MatchSeatAssignmentSchema,
  MatchTargetsSchema,
  type PlayerRef,
  SeatSchema,
  stripOptionalPrefix,
} from '@ks/core'
import type { MatchState } from '@ks/core'
import { RegisteredGameKeySchema } from '@ks/gameplay/definitions'
import * as v from 'valibot'

export const MatchCreationDefinitionSchema = v.pipe(
  v.object({
    gameKey: RegisteredGameKeySchema,
    targets: MatchTargetsSchema,
    firstBreakerSeat: SeatSchema,
    gameConfiguration: v.optional(GameConfigurationSchema),
  }),
  v.check(
    (value) =>
      value.gameKey !== 'free-pyramid-long' ||
      value.gameConfiguration?.rackRollover === 14 ||
      value.gameConfiguration?.rackRollover === 15,
    'Long free pyramid requires rack rollover configuration',
  ),
)

export const CreateMatchRequestSchema = v.pipe(
  v.intersect([
    MatchCreationDefinitionSchema,
    v.object({ participants: v.tuple([MatchSeatAssignmentSchema, MatchSeatAssignmentSchema]) }),
  ]),
  v.check(
    (value) => new Set(value.participants.map((participant) => participant.seat)).size === 2,
    'Participants must include one A and one B seat',
  ),
)

export type CreateMatchRequest = v.InferOutput<typeof CreateMatchRequestSchema>

export type MatchStateFor<K extends GameKey> = Omit<MatchState, 'gameKey'> & { gameKey: K }

type MatchAssignmentsBySeat = { A: PlayerRef; B: PlayerRef }

export function assignmentsBySeat(participants: CreateMatchRequest['participants']): MatchAssignmentsBySeat {
  const seatA = participants.find((participant) => participant.seat === 'A')
  const seatB = participants.find((participant) => participant.seat === 'B')
  if (!seatA || !seatB) {
    throw new Error('Participants must include one A and one B seat')
  }
  return {
    A: seatA.playerRef,
    B: seatB.playerRef,
  }
}

export function buildMatchConfig(matchId: MatchId, input: CreateMatchRequest): MatchConfig {
  return {
    matchId,
    gameKey: input.gameKey,
    targets: input.targets,
    firstBreakerSeat: input.firstBreakerSeat,
    gameConfiguration: input.gameConfiguration,
  }
}

export function normalizeMatchId(raw: string): MatchId {
  return v.parse(MatchIdSchema, stripOptionalPrefix(raw))
}
