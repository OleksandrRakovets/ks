import { describe, expect, test } from 'bun:test'

import { newCommandId } from '@ks/core'
import { Effect } from 'effect'

import {
  createdAt,
  matchId,
  playerRefA,
  playerRefB,
  RoomCommandResult,
  selectedClient,
  sparring,
  transfer,
} from './sparring.fixtures'

describe('sparring commands and finalization', () => {
  test('returns unknown-match for a missing, wrong-game, or creating Match without calling the room', async () => {
    for (const record of [
      null,
      {
        matchId,
        gameKey: 'strila-v2' as const,
        createdAt,
        participantRefs: { A: playerRefA, B: playerRefB },
        status: 'active' as const,
      },
      {
        matchId,
        gameKey: 'free-pyramid' as const,
        createdAt,
        participantRefs: { A: playerRefA, B: playerRefB },
        status: 'creating' as const,
      },
    ]) {
      const app = sparring(selectedClient(), [], { matches: { findMatch: async () => record } })

      expect(
        app.submitMatchCommand(
          matchId,
          { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
          'free-pyramid',
        ),
      ).rejects.toHaveProperty('_tag', 'MatchNotFound')
    }
  })

  test('returns match-finished without submitting or archiving again', async () => {
    const events: string[] = []

    expect(
      sparring(selectedClient(), events, { initialStatus: 'finished' }).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
        'free-pyramid',
      ),
    ).rejects.toHaveProperty('_tag', 'MatchFinished')
    expect(events).toEqual([])
  })

  test('returns command-id-conflict without archiving', async () => {
    const events: string[] = []
    const room = selectedClient({ submitCommand: async () => RoomCommandResult['command-id-conflict']() })

    const app = sparring(room, events)

    const failure = await Effect.runPromise(
      Effect.flip(
        app.service.submitMatchCommand(
          matchId,
          { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
          'free-pyramid',
        ),
      ),
    )

    expect(failure).toHaveProperty('_tag', 'MatchCommandIdConflict')
    expect(events).toEqual([])
  })

  test('archives and finishes after a match-ending Accepted Command', async () => {
    const events: string[] = []

    const room = selectedClient({
      submitCommand: async () => RoomCommandResult.accepted({ acceptedSeq: 1, endsMatch: true }),
      prepareArchive: async () => {
        events.push('prepare')

        return transfer
      },
    })

    const result = await sparring(room, events).submitMatchCommand(
      matchId,
      { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
      'free-pyramid',
    )

    expect(result).toMatchObject({ acceptedSeq: 1 })
    expect(result).toHaveProperty('_tag', 'accepted')
    expect(result).not.toHaveProperty('endsMatch')
    expect(events).toEqual(['prepare', 'archive', 'finish'])
  })

  test('resumes archival when Command submission discovers finalizing', async () => {
    const events: string[] = []

    const room = selectedClient({
      submitCommand: async () => RoomCommandResult.finalizing(),
      prepareArchive: async () => transfer,
    })

    expect(
      sparring(room, events).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
        'free-pyramid',
      ),
    ).rejects.toHaveProperty('_tag', 'MatchLocked')
    expect(events).toEqual(['archive', 'finish'])
  })

  test('returns malformed nested Commands as invalid request data', async () => {
    const room = selectedClient({ submitCommand: async () => RoomCommandResult['invalid-command']() })
    expect(
      sparring(room).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'unsupported' } },
        'free-pyramid',
      ),
    ).rejects.toHaveProperty('_tag', 'InvalidMatchCommand')
  })

  test('does not synthesize transport failures for thrown MatchRoom defects', async () => {
    const defect = new Error('room defect')
    const room = selectedClient({ submitCommand: () => Promise.reject(defect) })
    let error: Error | undefined

    try {
      await sparring(room).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
        'free-pyramid',
      )
    } catch (reason) {
      if (!(reason instanceof Error)) throw reason
      error = reason
    }

    expect(error).toBe(defect)
  })

  test('does not finish when archival fails before persistence', async () => {
    const events: string[] = []

    const room = selectedClient({
      submitCommand: async () => RoomCommandResult.accepted({ acceptedSeq: 1, endsMatch: true }),
      prepareArchive: async () => transfer,
    })

    const app = sparring(room, events, {
      matches: {
        archiveFinished: async () => {
          events.push('archive-failed')
          throw new Error('archive failed')
        },
      },
    })

    let archiveError: Error | undefined

    try {
      await app.submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
        'free-pyramid',
      )
    } catch (reason) {
      if (!(reason instanceof Error)) throw reason
      archiveError = reason
    }

    expect(archiveError?.message).toBe('archive failed')
    expect(events).toEqual(['archive-failed'])
  })

  test('retries idempotent archival after a persisted response is lost', async () => {
    const events: string[] = []
    let archiveAttempts = 0

    const room = selectedClient({
      submitCommand: async () => RoomCommandResult.accepted({ acceptedSeq: 1, endsMatch: true }),
      prepareArchive: async () => transfer,
    })

    const app = sparring(room, events, {
      matches: {
        archiveFinished: async () => {
          archiveAttempts += 1
          events.push(archiveAttempts === 1 ? 'archive-persisted-response-lost' : 'archive-retry')

          if (archiveAttempts === 1) throw new Error('lost archive response')
        },
      },
    })

    const command = {
      commandId: newCommandId(),
      source: 'match' as const,
      command: { type: 'frame.concede', seat: 'B' },
    }

    let archiveError: Error | undefined

    try {
      await app.submitMatchCommand(matchId, command, 'free-pyramid')
    } catch (reason) {
      if (!(reason instanceof Error)) throw reason
      archiveError = reason
    }

    expect(archiveError?.message).toBe('lost archive response')
    expect(events).toEqual(['archive-persisted-response-lost'])
    expect(await app.submitMatchCommand(matchId, command, 'free-pyramid')).toHaveProperty('_tag', 'accepted')
    expect(events).toEqual(['archive-persisted-response-lost', 'archive-retry', 'finish'])
  })

  test('retries archive and D1 finish after the first finish attempt fails', async () => {
    const events: string[] = []
    let finishAttempts = 0

    const room = selectedClient({
      submitCommand: async () => RoomCommandResult.accepted({ acceptedSeq: 1, endsMatch: true }),
      prepareArchive: async () => transfer,
    })

    const app = sparring(room, events, {
      matches: {
        markFinished: async () => {
          finishAttempts += 1
          events.push(finishAttempts === 1 ? 'finish-failed' : 'finish-retry')

          if (finishAttempts === 1) throw new Error('finish failed')
        },
      },
    })

    const command = {
      commandId: newCommandId(),
      source: 'match' as const,
      command: { type: 'frame.concede', seat: 'B' },
    }

    let finishError: Error | undefined

    try {
      await app.submitMatchCommand(matchId, command, 'free-pyramid')
    } catch (reason) {
      if (!(reason instanceof Error)) throw reason
      finishError = reason
    }

    expect(finishError?.message).toBe('finish failed')
    expect(events).toEqual(['archive', 'finish-failed'])
    expect(await app.submitMatchCommand(matchId, command, 'free-pyramid')).toHaveProperty('_tag', 'accepted')
    expect(events).toEqual(['archive', 'finish-failed', 'archive', 'finish-retry'])
  })
})
