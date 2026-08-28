import {
  GameConfiguration,
  type GameKey,
  type MatchConfig,
  type MatchId,
  MatchSeatAssignment,
  MatchTargets,
  Seat,
} from '@ks/core'
import type { MatchState } from '@ks/core'
import { RegisteredGameKeySchema } from '@ks/gameplay/definitions'
import * as v from 'valibot'

export const MatchCreationDefinitionSchema = v.pipe(
  v.object({
    gameKey: RegisteredGameKeySchema,
    targets: MatchTargets,
    firstBreakerSeat: Seat,
    gameConfiguration: v.optional(GameConfiguration),
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
    v.object({ participants: v.tuple([MatchSeatAssignment, MatchSeatAssignment]) }),
  ]),
  v.check(
    (value) => new Set(value.participants.map((participant) => participant.seat)).size === 2,
    'Participants must include one A and one B seat',
  ),
)

export type CreateMatchRequest = v.InferOutput<typeof CreateMatchRequestSchema>

export type MatchStateFor<K extends GameKey> = Omit<MatchState, 'gameKey'> & { gameKey: K }

export function buildMatchConfig(matchId: MatchId, input: CreateMatchRequest): MatchConfig {
  const config: MatchConfig = {
    matchId,
    gameKey: input.gameKey,
    targets: input.targets,
    firstBreakerSeat: input.firstBreakerSeat,
  }
  // Omit absent optional values so MatchConfig remains structurally equal after JSON persistence round-trips.
  if (input.gameConfiguration !== undefined) config.gameConfiguration = input.gameConfiguration
  return config
}
