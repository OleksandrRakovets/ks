import type { CreateMatchRequest } from '@ks/competition'
import type { MatchId } from '@ks/core'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Context, Effect, Predicate } from 'effect'
import * as v from 'valibot'

import { ApplicationClock } from '../match/clock'
import type { MatchRoomInitializationInput } from '../match/match-room'
import { MatchRooms } from '../match/match-room'
import { splitGuestDisplayName } from '../player/participant'
import { PlayerStorage } from '../player/storage/player-storage'
import { CreateSparringMatchInput, type CreateSparringMatchResult } from './contract'
import { SparringMatchStorage } from './storage/sparring-match-storage'

export class MatchCreation extends Context.Service<
  MatchCreation,
  { newMatchId(): MatchId; newControlSecret(): string }
>()('@ks/application/sparring/create-match') {}

export const createMatch = Effect.fn('createMatch')(function* (
  input: CreateSparringMatchInput,
): Effect.fn.Return<
  CreateSparringMatchResult,
  EffectDrizzleQueryError,
  ApplicationClock | MatchCreation | MatchRooms | PlayerStorage | SparringMatchStorage
> {
  const parsed = v.safeParse(CreateSparringMatchInput, input)

  if (!parsed.success) return { ok: false, reason: 'invalid-input' }
  const creation = yield* MatchCreation
  const clock = yield* ApplicationClock
  const players = yield* PlayerStorage
  const matches = yield* SparringMatchStorage
  const rooms = yield* MatchRooms
  const matchId = creation.newMatchId()
  const controlSecret = creation.newControlSecret()
  const createdAt = clock.nowMs()
  const { playerNames, ...requestInput } = parsed.output

  const [seatAPlayerRef, seatBPlayerRef] = yield* Effect.all(
    [
      players.ensureGuestRef(splitGuestDisplayName(playerNames.A)),
      players.ensureGuestRef(splitGuestDisplayName(playerNames.B)),
    ],
    { concurrency: 'unbounded' },
  )

  const participants: CreateMatchRequest['participants'] = [
    { seat: 'A', playerRef: seatAPlayerRef },
    { seat: 'B', playerRef: seatBPlayerRef },
  ]

  const request: MatchRoomInitializationInput = {
    ...requestInput,
    participants,
    matchId,
    controlSecret,
    createdAt,
  }

  yield* matches.beginCreation({
    matchId,
    gameKey: request.gameKey,
    participantRefs: { A: seatAPlayerRef, B: seatBPlayerRef },
    createdAt,
  })
  const result = yield* rooms.get(matchId).initialize(request)

  if (Predicate.isTagged(result, 'initialization-conflict'))
    return { ok: false, reason: 'initialization-conflict' }
  yield* matches.activate(matchId)

  return { ok: true, matchId }
})
