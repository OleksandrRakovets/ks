import { describe, expect, test } from 'bun:test'

import { newCommandId } from '@ks/core'

import {
  createdAt,
  matchId,
  participantRecords,
  playerRefA,
  playerRefB,
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
        await app.submitMatchCommand(
          matchId,
          { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
          'free-pyramid',
        ),
      ).toEqual({ ok: false, reason: 'unknown-match' })
    }
  })

  test('returns match-finished without submitting or archiving again', async () => {
    expect(
      await sparring(selectedClient(), [], { initialStatus: 'finished' }).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, reason: 'match-finished' })
  })

  test('returns command-id-conflict without archiving', async () => {
    const events: string[] = []
    const room = selectedClient({ submitCommand: async () => ({ _tag: 'command-id-conflict' }) })

    expect(
      await sparring(room, events).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, reason: 'command-id-conflict' })
    expect(events).toEqual([])
  })

  test('archives and finishes after a match-ending Accepted Command', async () => {
    const events: string[] = []

    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, endsMatch: true }),
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

    expect(result).toEqual({ ok: true, outcome: { _tag: 'accepted', acceptedSeq: 1 } })
    expect(events).toEqual(['prepare', 'archive', 'finish'])
  })

  test('resumes archival when Command submission discovers finalizing', async () => {
    const events: string[] = []

    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'finalizing' }),
      prepareArchive: async () => transfer,
    })

    expect(
      await sparring(room, events).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.concede', seat: 'B' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, reason: 'match-locked' })
    expect(events).toEqual(['archive', 'finish'])
  })

  test('returns malformed nested Commands as invalid request data', async () => {
    const room = selectedClient({ submitCommand: async () => ({ _tag: 'invalid-command' }) })
    expect(
      await sparring(room).submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'unsupported' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, reason: 'invalid-command' })
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
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, endsMatch: true }),
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
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, endsMatch: true }),
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
    expect(await app.submitMatchCommand(matchId, command, 'free-pyramid')).toMatchObject({ ok: true })
    expect(events).toEqual(['archive-persisted-response-lost', 'archive-retry', 'finish'])
  })

  test('retries archive and D1 finish after the first finish attempt fails', async () => {
    const events: string[] = []
    let finishAttempts = 0

    const room = selectedClient({
      submitCommand: async () => ({ _tag: 'accepted', acceptedSeq: 1, endsMatch: true }),
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
    expect(await app.submitMatchCommand(matchId, command, 'free-pyramid')).toMatchObject({ ok: true })
    expect(events).toEqual(['archive', 'finish-failed', 'archive', 'finish-retry'])
  })
})

describe('sparring soft deletion', () => {
  test('discards without archiving and makes every public read and command treat the Match as missing', async () => {
    const app = sparring(
      selectedClient({ discard: async () => ({ _tag: 'discarded', endedAt: transfer.endedAt }) }),
      [],
      {
        matches: {
          archiveFinished: async () => {
            throw new Error('Discard must not archive')
          },
          markFinished: async () => {
            throw new Error('Discard must not finish')
          },
        },
      },
    )

    expect(await app.discardMatch(matchId, 'free-pyramid')).toEqual({ ok: true })
    expect(await app.discardMatch(matchId, 'free-pyramid')).toEqual({ ok: true })
    expect(await app.readMatch(matchId, 'en', 'free-pyramid')).toEqual({ ok: false, reason: 'unknown-match' })
    expect(await app.readMatchProtocol(matchId, 'en', 'free-pyramid')).toEqual({
      ok: false,
      reason: 'unknown-match',
    })
    expect(await app.readMatchScores([matchId])).toEqual({ ok: false, reason: 'unknown-match' })
    expect(await app.admitMatchLive(matchId)).toEqual({ _tag: 'unknown' })
    expect(
      await app.submitMatchCommand(
        matchId,
        { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
        'free-pyramid',
      ),
    ).toEqual({ ok: false, reason: 'unknown-match' })
  })

  test('hides a room-first discard before D1 completion and recovers on a repeated discard or command POST', async () => {
    for (const recovery of ['discard', 'command'] as const) {
      let failWrite = true
      let discarded = false

      const app = sparring(
        selectedClient({
          discard: async () => ({ _tag: 'discarded', endedAt: transfer.endedAt }),
          getControls: async () => ({ _tag: 'discarded' }),
          getProtocol: async () => ({ _tag: 'discarded' }),
          getScore: async () => ({ _tag: 'discarded' }),
          submitCommand: async () => ({ _tag: 'discarded', endedAt: transfer.endedAt }),
        }),
        [],
        {
          matches: {
            findMatch: async () => ({
              matchId,
              gameKey: 'free-pyramid',
              createdAt,
              participantRefs: { A: playerRefA, B: playerRefB },
              ...(discarded
                ? { status: 'discarded' as const, endedAt: transfer.endedAt }
                : { status: 'active' as const }),
            }),
            markDiscarded: async () => {
              if (failWrite) throw new Error('D1 unavailable')
              discarded = true
            },
            listLive: async () => [
              {
                matchId,
                gameKey: 'free-pyramid',
                status: 'active',
                createdAt,
                participantRefs: { A: playerRefA, B: playerRefB },
                participants: participantRecords,
              },
            ],
          },
        },
      )

      expect(app.discardMatch(matchId, 'free-pyramid')).rejects.toThrow('D1 unavailable')
      expect(await app.readMatch(matchId, 'en', 'free-pyramid')).toEqual({
        ok: false,
        reason: 'unknown-match',
      })
      expect(await app.readMatchProtocol(matchId, 'en', 'free-pyramid')).toEqual({
        ok: false,
        reason: 'unknown-match',
      })
      expect(await app.readMatchScores([matchId])).toEqual({ ok: false, reason: 'unknown-match' })
      expect((await app.listLiveMatches('en')).matches).toEqual([])

      failWrite = false

      if (recovery === 'discard') expect(await app.discardMatch(matchId, 'free-pyramid')).toEqual({ ok: true })
      else
        expect(
          await app.submitMatchCommand(
            matchId,
            { commandId: newCommandId(), source: 'match', command: { type: 'frame.commence', seat: 'A' } },
            'free-pyramid',
          ),
        ).toEqual({ ok: false, reason: 'unknown-match' })
      expect(await app.admitMatchLive(matchId)).toEqual({ _tag: 'unknown' })
    }
  })

  test('rejects finished and finalizing Matches rather than discarding their result', async () => {
    expect(
      await sparring(selectedClient(), [], { initialStatus: 'finished' }).discardMatch(
        matchId,
        'free-pyramid',
      ),
    ).toEqual({ ok: false, reason: 'match-locked' })
    expect(
      await sparring(selectedClient({ discard: async () => ({ _tag: 'finalizing' }) })).discardMatch(
        matchId,
        'free-pyramid',
      ),
    ).toEqual({ ok: false, reason: 'match-locked' })
    expect(await sparring(selectedClient()).discardMatch(matchId, 'strila-v2')).toEqual({
      ok: false,
      reason: 'unknown-match',
    })
  })
})
