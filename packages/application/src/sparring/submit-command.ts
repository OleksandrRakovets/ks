import type { MatchCommand, MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Effect, Match } from 'effect'

import { MatchRooms } from '../match/match-room'
import { CommandReceiptOutcome, type SubmitMatchCommandResult } from './contract'
import { SparringMatchStorage } from './storage/sparring-match-storage'

export const submitMatchCommand = Effect.fn('submitMatchCommand')(function* (
  matchId: MatchId,
  command: MatchCommand,
  expectedGameKey: GameKey,
): Effect.fn.Return<SubmitMatchCommandResult, EffectDrizzleQueryError, MatchRooms | SparringMatchStorage> {
  const matches = yield* SparringMatchStorage
  const rooms = yield* MatchRooms
  const record = yield* matches.findMatch(matchId)

  if (!record || record.gameKey !== expectedGameKey) return { ok: false, reason: 'unknown-match' }

  if (record.status === 'finished') return { ok: false, reason: 'match-finished' }

  if (record.status !== 'active') return { ok: false, reason: 'unknown-match' }
  const result = yield* rooms.get(matchId).submitCommand(command)

  return yield* Match.value(result).pipe(
    Match.tagsExhaustive({
      accepted: Effect.fnUntraced(function* ({ acceptedSeq, endsMatch }) {
        if (endsMatch) yield* archiveAndMarkFinished(matchId)

        return { ok: true as const, outcome: CommandReceiptOutcome.accepted({ acceptedSeq }) }
      }),
      finalizing: Effect.fnUntraced(function* () {
        yield* archiveAndMarkFinished(matchId)

        return { ok: false as const, reason: 'match-locked' as const }
      }),
      'invalid-command': () =>
        Effect.succeed<SubmitMatchCommandResult>({ ok: false, reason: 'invalid-command' }),
      'command-id-conflict': () =>
        Effect.succeed<SubmitMatchCommandResult>({ ok: false, reason: 'command-id-conflict' }),
      rejected: (outcome) => Effect.succeed<SubmitMatchCommandResult>({ ok: true, outcome }),
    }),
  )
})

const archiveAndMarkFinished = Effect.fn('archiveAndMarkFinished')(function* (matchId: MatchId) {
  const matches = yield* SparringMatchStorage
  const rooms = yield* MatchRooms
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
