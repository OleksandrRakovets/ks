import type { MatchCommand, MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import type { EffectDrizzleQueryError } from 'drizzle-orm/effect-core/errors'
import { Effect } from 'effect'

import { MatchRooms } from '../match/match-room'
import type { SubmitMatchCommandResult } from './contract'
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

  if (result._tag === 'accepted' && result.endsMatch) {
    yield* archiveAndMarkFinished(matchId)

    return { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
  }

  if (result._tag === 'finalizing') {
    yield* archiveAndMarkFinished(matchId)

    return { ok: false, reason: 'match-locked' }
  }

  if (result._tag === 'invalid-command') return { ok: false, reason: 'invalid-command' }

  if (result._tag === 'command-id-conflict') return { ok: false, reason: 'command-id-conflict' }

  return result._tag === 'accepted'
    ? { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
    : { ok: true, outcome: result }
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
