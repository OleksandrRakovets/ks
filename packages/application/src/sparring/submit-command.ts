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

  if (!record || record.gameKey !== expectedGameKey || record.status === 'discarded')
    return { ok: false, reason: 'unknown-match' }

  if (record.status === 'finished') return { ok: false, reason: 'match-finished' }

  if (record.status !== 'active') return { ok: false, reason: 'unknown-match' }
  const result = await submitToRoom(deps, matchId, command)

  if (result._tag === 'discarded') {
    await deps.matches.markDiscarded(matchId, result.endedAt)

    return { ok: false, reason: 'unknown-match' }
  }

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

const SUBMIT_ATTEMPTS = 3

const SUBMIT_BACKOFF_BASE_MS = 50

/**
 * Retries transient Durable Object infrastructure failures, which can arrive after the room has
 * committed the Command. Retrying is safe because the room returns the stored receipt for a
 * repeated command ID. Each attempt uses a fresh stub, because a failed stub stays broken.
 */
async function submitToRoom(deps: SparringDependencies, matchId: MatchId, command: MatchCommand) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await deps.matchRoomClient(matchId).submitCommand(command)
    } catch (error) {
      if (attempt >= SUBMIT_ATTEMPTS || !isRetryableRoomFailure(error)) throw error

      console.warn({
        event: 'match-command.retry',
        matchId,
        commandId: command.commandId,
        attempt,
        error: error.message,
      })
      await new Promise((resolve) => {
        setTimeout(resolve, SUBMIT_BACKOFF_BASE_MS * Math.random() * 2 ** attempt)
      })
    }
  }
}

/** Cloudflare marks transient stub failures `retryable`; `overloaded` ones must not be retried. */
function isRetryableRoomFailure(error: unknown): error is Error {
  return (
    error instanceof Error &&
    'retryable' in error &&
    error.retryable === true &&
    !('overloaded' in error && error.overloaded === true)
  )
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
