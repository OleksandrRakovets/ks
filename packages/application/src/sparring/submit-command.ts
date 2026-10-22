import type { MatchCommand, MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import type { MatchRoomClient } from '../match/match-room'
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
  const result = await callRoom(deps, matchId, (room) => room.submitCommand(command))

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

const ROOM_ATTEMPTS = 3

const ROOM_BACKOFF_BASE_MS = 50

/**
 * Retries a MatchRoom RPC that the Workers runtime marks as transient. A storage reset can fail
 * the call after the room committed, so only idempotent operations may use this: `submitCommand`
 * returns the stored receipt for a repeated command ID, and `prepareArchive` writes nothing. Each
 * attempt uses a fresh stub, because a failed stub stays broken.
 */
async function callRoom<T>(
  deps: SparringDependencies,
  matchId: MatchId,
  call: (room: MatchRoomClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call(deps.matchRoomClient(matchId))
    } catch (error) {
      const flags = v.safeParse(RoomFailureFlags, error)

      // Follow the runtime's hints, not provenance: our own room code could set them too. A
      // storage reset may set only `durableObjectReset`; `overloaded` must never be retried.
      const transient =
        flags.success &&
        (flags.output.retryable === true || flags.output.durableObjectReset === true) &&
        flags.output.overloaded !== true

      if (attempt >= ROOM_ATTEMPTS || !transient) throw error

      console.warn({ event: 'match-room.retry', matchId, attempt, error, ...flags.output })
      await new Promise((resolve) => {
        setTimeout(resolve, ROOM_BACKOFF_BASE_MS * Math.random() * 2 ** attempt)
      })
    }
  }
}

/** Retry hints the Workers runtime attaches to a failed Durable Object call. */
const RoomFailureFlags = v.object({
  retryable: v.optional(v.boolean()),
  overloaded: v.optional(v.boolean()),
  durableObjectReset: v.optional(v.boolean()),
  remote: v.optional(v.boolean()),
})

async function archiveAndMarkFinished(deps: SparringDependencies, matchId: MatchId): Promise<void> {
  let stage = 'prepare-archive'

  try {
    const transfer = await callRoom(deps, matchId, (room) => room.prepareArchive())
    stage = 'archive-in-d1'
    await deps.matches.archiveFinished(transfer)
    stage = 'mark-d1-finished'
    await deps.matches.markFinished(transfer)
  } catch (error) {
    console.error({ event: 'match-archive.failed', matchId, stage, error })
    throw error
  }
}
