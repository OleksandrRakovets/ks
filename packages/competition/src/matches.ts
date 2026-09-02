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
import { RegisteredGameKey } from '@ks/gameplay/definitions'
import * as v from 'valibot'

export const MatchCreationDefinition = v.pipe(
  v.object({
    gameKey: RegisteredGameKey,
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
  v.readonly(),
)
export type MatchCreationDefinition = v.InferOutput<typeof MatchCreationDefinition>

export const CreateMatchRequest = v.pipe(
  v.intersect([
    MatchCreationDefinition,
    v.object({
      participants: v.pipe(v.tuple([MatchSeatAssignment, MatchSeatAssignment]), v.readonly()),
    }),
  ]),
  v.check(
    (value) => new Set(value.participants.map((participant) => participant.seat)).size === 2,
    'Participants must include one A and one B seat',
  ),
  v.readonly(),
)

export type CreateMatchRequest = v.InferOutput<typeof CreateMatchRequest>

export type MatchStateFor<K extends GameKey> = Omit<MatchState, 'gameKey'> & { readonly gameKey: K }

export function buildMatchConfig(matchId: MatchId, input: CreateMatchRequest): MatchConfig {
  const config = {
    matchId,
    gameKey: input.gameKey,
    targets: input.targets,
    firstBreakerSeat: input.firstBreakerSeat,
  }
  // Omit absent optional values so MatchConfig remains structurally equal after JSON persistence round-trips.
  return input.gameConfiguration === undefined
    ? config
    : { ...config, gameConfiguration: input.gameConfiguration }
}
