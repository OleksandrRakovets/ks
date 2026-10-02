import type { CreateMatchRequest } from '@ks/competition'
import type { MatchId } from '@ks/core'
import { Context, Effect, Predicate } from 'effect'
import * as v from 'valibot'

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
  { newMatchId(): MatchId; newControlSecret(): string }
>()('@ks/application/sparring/create-match') {}

export const creationMethods = Effect.gen(function* () {
  const creation = yield* MatchCreation
  const clock = yield* ApplicationClock
  const players = yield* PlayerStorage
  const matches = yield* SparringMatchStorage
  const rooms = yield* MatchRooms

  const createMatch = Effect.fn('SparringService.createMatch')(function* (input: CreateSparringMatchInput) {
    const parsed = v.safeParse(CreateSparringMatchInput, input)

    if (!parsed.success) return yield* Effect.fail(new InvalidMatchInput())

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
      return yield* Effect.fail(new MatchInitializationConflict())

    yield* matches.activate(matchId)

    return { matchId }
  })

  return { createMatch }
})
