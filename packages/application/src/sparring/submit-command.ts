import type { MatchCommand, MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import { Effect, Match } from 'effect'

import { MatchRooms } from '../match/match-room'
import {
  InvalidMatchCommand,
  MatchCommandIdConflict,
  MatchCommandRejected,
  MatchFinished,
  MatchLocked,
  MatchNotFound,
} from './errors'
import { SparringMatchStorage } from './storage/sparring-match-storage'

export const commandMethods = Effect.gen(function* () {
  const matches = yield* SparringMatchStorage
  const rooms = yield* MatchRooms

  const submitMatchCommand = Effect.fn('SparringService.submitMatchCommand')(function* (
    matchId: typeof MatchId.Type,
    command: typeof MatchCommand.Type,
    expectedGameKey: typeof GameKey.Type,
  ) {
    const record = yield* matches.findMatch(matchId)

    if (!record || record.gameKey !== expectedGameKey) return yield* Effect.fail(new MatchNotFound())

    if (record.status === 'finished') return yield* Effect.fail(new MatchFinished())

    if (record.status !== 'active') return yield* Effect.fail(new MatchNotFound())

    const result = yield* rooms.get(matchId).submitCommand(command)

    return yield* Match.value(result).pipe(
      Match.tagsExhaustive({
        accepted: Effect.fnUntraced(function* ({ acceptedSeq, endsMatch }) {
          if (endsMatch) yield* archiveAndMarkFinished(matchId)

          return { acceptedSeq } as const
        }),
        finalizing: Effect.fnUntraced(function* () {
          yield* archiveAndMarkFinished(matchId)

          return yield* Effect.fail(new MatchLocked())
        }),
        'invalid-command': () => Effect.fail(new InvalidMatchCommand()),
        'command-id-conflict': () => Effect.fail(new MatchCommandIdConflict()),
        rejected: ({ reason }) => Effect.fail(new MatchCommandRejected({ reason })),
      }),
    )
  })

  const archiveAndMarkFinished = Effect.fn('SparringService.archiveAndMarkFinished')(function* (
    matchId: typeof MatchId.Type,
  ) {
    let stage = 'prepare-archive'

    yield* Effect.gen(function* () {
      const transfer = yield* rooms.get(matchId).prepareArchive()
      stage = 'archive-in-d1'
      yield* matches.archiveFinished(transfer)
      stage = 'mark-d1-finished'
      yield* matches.markFinished(transfer)
    }).pipe(
      Effect.tapCause((cause) => Effect.logError({ event: 'match-archive.failed', matchId, stage, cause })),
    )
  })

  return { submitMatchCommand }
})
