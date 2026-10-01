import type { MatchCommand, MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'

import type { SubmitMatchCommandResult } from './contract'
import type { SparringDependencies } from './sparring-application'

export async function submitMatchCommand(
  deps: SparringDependencies,
  matchId: MatchId,
  command: MatchCommand,
  expectedGameKey: GameKey,
): Promise<SubmitMatchCommandResult> {
  const record = await deps.matches.findMatch(matchId)

  if (!record || record.gameKey !== expectedGameKey) return { ok: false, reason: 'unknown-match' }

  if (record.status === 'finished') return { ok: false, reason: 'match-finished' }

  if (record.status !== 'active') return { ok: false, reason: 'unknown-match' }
  const result = await deps.matchRoomClient(matchId).submitCommand(command)

  if (result._tag === 'accepted' && result.endsMatch) {
    await archiveAndMarkFinished(deps, matchId)

    return { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
  }

  if (result._tag === 'finalizing') {
    await archiveAndMarkFinished(deps, matchId)

    return { ok: false, reason: 'match-locked' }
  }

  if (result._tag === 'invalid-command') return { ok: false, reason: 'invalid-command' }

  if (result._tag === 'command-id-conflict') return { ok: false, reason: 'command-id-conflict' }

  return result._tag === 'accepted'
    ? { ok: true, outcome: { _tag: 'accepted', acceptedSeq: result.acceptedSeq } }
    : { ok: true, outcome: result }
}

async function archiveAndMarkFinished(deps: SparringDependencies, matchId: MatchId): Promise<void> {
  let stage = 'prepare-archive'

  try {
    const transfer = await deps.matchRoomClient(matchId).prepareArchive()
    stage = 'archive-in-d1'
    await deps.matches.archiveFinished(transfer)
    stage = 'mark-d1-finished'
    await deps.matches.markFinished(transfer)
  } catch (error) {
    console.error({ event: 'match-archive.failed', matchId, stage, error })
    throw error
  }
}
