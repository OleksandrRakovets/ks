import type { CreateMatchRequest } from '@ks/competition'
import type { MatchId } from '@ks/core'
import { Context, Effect, Predicate, Result, Schema } from 'effect'

import { ApplicationClock } from '../match/clock'
import type { MatchRoomInitializationInput } from '../match/match-room'
import { MatchRooms } from '../match/match-room'
import { splitGuestDisplayName } from '../player/participant'
import { PlayerStorage } from '../player/storage/player-storage'
import { CreateSparringMatchInput } from './contract'
import { InvalidMatchInput, MatchInitializationConflict } from './errors'
import { SparringMatchStorage } from './storage/sparring-match-storage'

export class MatchCreation extends Context.Service<
  MatchCreation,
  { newMatchId(): typeof MatchId.Type; newControlSecret(): string }
>()('@ks/application/sparring/create-match') {}

export const creationMethods = Effect.gen(function* () {
  const creation = yield* MatchCreation
  const clock = yield* ApplicationClock
  const players = yield* PlayerStorage
  const matches = yield* SparringMatchStorage
  const rooms = yield* MatchRooms

  const createMatch = Effect.fn('SparringService.createMatch')(function* (
    input: typeof CreateSparringMatchInput.Type,
  ) {
    const parsed = Schema.decodeUnknownResult(CreateSparringMatchInput)(input)

    if (Result.isFailure(parsed)) return yield* Effect.fail(new InvalidMatchInput())

    const matchId = creation.newMatchId()
    const controlSecret = creation.newControlSecret()
    const createdAt = clock.nowMs()
    const { playerNames, ...requestInput } = parsed.success

    const [seatAPlayerRef, seatBPlayerRef] = yield* Effect.all(
      [
        players.ensureGuestRef(splitGuestDisplayName(playerNames.A)),
        players.ensureGuestRef(splitGuestDisplayName(playerNames.B)),
      ],
      { concurrency: 'unbounded' },
    )

    const participants: (typeof CreateMatchRequest.Type)['participants'] = [
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
      return yield* Effect.fail(new MatchInitializationConflict())

    yield* matches.activate(matchId)

    return { matchId }
  })

  return { createMatch }
})
