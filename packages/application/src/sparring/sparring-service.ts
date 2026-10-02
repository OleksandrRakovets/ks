import type { MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Context, Effect, Layer } from 'effect'

import { ApplicationClock } from '../match/clock'
import { MatchRooms } from '../match/match-room'
import { PlayerStorage } from '../player/storage/player-storage'
import { admitMatchLive } from './admit-live'
import type { ReadMatchProtocolResult, ReadMatchResult } from './contract'
import { createMatch, MatchCreation } from './create-match'
import { listFinishedMatches, listLiveMatches, readMatchScores } from './list-matches'
import { readMatch, readMatchProtocol } from './read-match'
import { SparringMatchStorage } from './storage/sparring-match-storage'
import { submitMatchCommand } from './submit-command'

/** Public use cases capture private dependencies when the layer is built; execution stays with the caller. */
export class SparringService extends Context.Service<SparringService>()(
  '@ks/application/sparring/sparring-service',
  {
    make: Effect.gen(function* () {
      const context = yield* Effect.context<
        ApplicationClock | MatchCreation | MatchRooms | PlayerStorage | SparringMatchStorage
      >()

      const provide = Effect.provideContext(context)

      return {
        createMatch: Effect.fnUntraced(function* (...args: Parameters<typeof createMatch>) {
          return yield* provide(createMatch(...args))
        }),
        listLiveMatches: Effect.fnUntraced(function* (...args: Parameters<typeof listLiveMatches>) {
          return yield* provide(listLiveMatches(...args))
        }),
        listFinishedMatches: Effect.fnUntraced(function* (...args: Parameters<typeof listFinishedMatches>) {
          return yield* provide(listFinishedMatches(...args))
        }),
        readMatchScores: Effect.fnUntraced(function* (...args: Parameters<typeof readMatchScores>) {
          return yield* provide(readMatchScores(...args))
        }),
        readMatch: Effect.fnUntraced(function* <K extends GameKey>(
          matchId: MatchId,
          locale: SupportedLocale,
          expectedGameKey: K,
        ): Effect.fn.Return<ReadMatchResult<K>, EffectDrizzleQueryError> {
          return yield* provide(readMatch(matchId, locale, expectedGameKey))
        }),
        submitMatchCommand: Effect.fnUntraced(function* (...args: Parameters<typeof submitMatchCommand>) {
          return yield* provide(submitMatchCommand(...args))
        }),
        readMatchProtocol: Effect.fnUntraced(function* <K extends GameKey>(
          matchId: MatchId,
          locale: SupportedLocale,
          expectedGameKey: K,
        ): Effect.fn.Return<ReadMatchProtocolResult<K>, EffectDrizzleQueryError> {
          return yield* provide(readMatchProtocol(matchId, locale, expectedGameKey))
        }),
        admitMatchLive: Effect.fnUntraced(function* (...args: Parameters<typeof admitMatchLive>) {
          return yield* provide(admitMatchLive(...args))
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
