import { describe, expect, test } from 'bun:test'

import { createMatch } from '@ks/competition'
import { FixedClock, newCommandId, newMatchId } from '@ks/core'

import {
  createdAt,
  matchId,
  playerRefA,
  playerRefB,
  selectedClient,
  sparring,
  state,
  transfer,
} from './sparring.fixtures'
import {
  ProtocolArchiveCorruptionError,
  UnsupportedProtocolArchiveVersionError,
} from './storage/protocol-archive'

describe('sparring match and Protocol reads', () => {
  test('returns unknown-match for missing, wrong-game, and creating rows without selecting a source', async () => {
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

      for (const read of ['readMatch', 'readMatchProtocol'] as const)
        expect(await app[read](matchId, 'en', 'free-pyramid')).toEqual({ ok: false, reason: 'unknown-match' })
    }
  })

  test('rejects missing finished archives instead of returning a domain failure', async () => {
    const app = sparring(selectedClient(), [], {
      initialStatus: 'finished',
      matches: {
        findFinishedArchive: async () => null,
        findProtocolArchive: async () => null,
      },
    })

    for (const read of ['readMatch', 'readMatchProtocol'] as const)
      expect(await readFailure(app, read)).toMatchObject({
        message: 'Missing finished match archive',
      })
  })

  test('propagates archive corruption from both finished reads', async () => {
    const defect = new ProtocolArchiveCorruptionError(matchId)

    const app = sparring(selectedClient(), [], {
      initialStatus: 'finished',
      matches: {
        findFinishedArchive: async () => {
          throw defect
        },
        findProtocolArchive: async () => {
          throw defect
        },
      },
    })

    for (const read of ['readMatch', 'readMatchProtocol'] as const)
      expect(await readFailure(app, read)).toBe(defect)
  })

  test('propagates an unsupported Protocol archive version', async () => {
    const defect = new UnsupportedProtocolArchiveVersionError(matchId, 2)

    const app = sparring(selectedClient(), [], {
      initialStatus: 'finished',
      matches: {
        findFinishedArchive: async () => {
          throw defect
        },
        findProtocolArchive: async () => {
          throw defect
        },
      },
    })

    for (const read of ['readMatch', 'readMatchProtocol'] as const)
      expect(await readFailure(app, read)).toBe(defect)
  })

  test('rejects finished archive identity conflicts instead of treating them as unknown Matches', async () => {
    for (const conflictingState of [
      { ...transfer.finalState, matchId: newMatchId() },
      { ...transfer.finalState, gameKey: 'strila-v2' as const },
    ]) {
      const archive = { sourceLatestSeq: 1, state: conflictingState, gameResult: null }

      const app = sparring(selectedClient(), [], {
        initialStatus: 'finished',
        matches: {
          findFinishedArchive: async () => archive,
          findProtocolArchive: async () => ({ ...archive, protocolVersion: 1, entries: [] }),
        },
      })

      for (const read of ['readMatch', 'readMatchProtocol'] as const)
        expect(await readFailure(app, read)).toMatchObject({
          message: 'Finished match archive identity conflicts with D1',
        })
    }
  })

  test('rejects active and finalizing room identity conflicts on both read paths', async () => {
    for (const identity of [{ matchId: newMatchId() }, { gameKey: 'strila-v2' as const }]) {
      for (const finalizing of [false, true]) {
        const projection = finalizing
          ? {
              _tag: 'finalizing' as const,
              state: { ...transfer.finalState, ...identity },
              gameResult: null,
              latestSeq: 1,
              endedAt: transfer.endedAt,
            }
          : {
              _tag: 'active' as const,
              state: { ...state, ...identity },
              latestSeq: 0,
              game: undefined,
              controls: [],
              lastCommand: null,
            }

        const app = sparring(
          selectedClient({
            getControls: async () => projection,
            getProtocol: async () => ({ ...projection, protocolEntries: [] }),
          }),
        )

        for (const read of ['readMatch', 'readMatchProtocol'] as const)
          expect(await readFailure(app, read)).toMatchObject({
            message: `MatchRoom ${finalizing ? 'finalizing' : 'active'} identity conflicts with D1`,
          })
      }
    }
  })

  test('enriches prepared and open-play Controls with the current frame and last-command correction', async () => {
    const match = createMatch({
      matchId,
      gameKey: 'free-pyramid',
      targets: state.targets,
      firstBreakerSeat: 'A',
    })

    const potCommandId = newCommandId()
    let latestSeq = 0
    let calls = 0

    const room = selectedClient({
      getControls: async () => {
        calls += 1
        const projected = match.controlProjection()

        if (projected.controlPhase === 'finished') throw new Error('Expected active fixture')
        const { controlPhase: _controlPhase, ...projection } = projected

        return {
          _tag: 'active',
          ...projection,
          latestSeq,
          lastCommand:
            latestSeq === 0
              ? null
              : {
                  entry: {
                    acceptedSeq: 2,
                    entryIndex: 0,
                    causedByCommandId: potCommandId,
                    acceptedAt: createdAt,
                    frameIndex: 1,
                    gameKey: 'free-pyramid',
                    source: 'player',
                    entryType: 'player-command',
                    seat: 'B',
                    body: { commandType: 'pot.record', pottedBallCount: 2 },
                    scoreAfter: { A: 0, B: 2 },
                  },
                  correction: {
                    source: 'match',
                    type: 'command.correct',
                    fixedInput: { targetSeq: 2, targetCommandId: potCommandId },
                    prominence: 'secondary',
                  },
                },
        }
      },
    })

    const app = sparring(room)
    const prepared = await app.readMatch(matchId, 'en', 'free-pyramid')
    expect(prepared).toMatchObject({
      ok: true,
      lifecycle: 'active',
      controlPhase: 'frame-active',
      latestSeq: 0,
      matchId,
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
      framesWonBySeat: { A: 0, B: 0 },
      winnerSeat: null,
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 0, B: 0 } },
      game: { gameKey: 'free-pyramid', details: { phase: 'not-started' } },
      controls: [{ source: 'match', type: 'frame.commence', seat: 'A' }],
    })
    expect(prepared).not.toHaveProperty('lastCommand')
    expect(calls).toBe(1)
    match.execute({
      commandId: newCommandId(),
      source: 'match',
      command: { type: 'frame.commence', seat: 'A' },
    })
    match.execute({
      commandId: potCommandId,
      source: 'game',
      command: { type: 'pot.record', seat: 'B', pottedBallCount: 2 },
    })
    latestSeq = 2
    const result = await app.readMatch(matchId, 'en', 'free-pyramid')
    expect(result).toMatchObject({
      ok: true,
      lifecycle: 'active',
      controlPhase: 'frame-active',
      latestSeq: 2,
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 0, B: 2 } },
      game: { gameKey: 'free-pyramid', score: { A: 0, B: 2 }, details: { phase: 'open-play' } },
      lastCommand: {
        message: {
          key: 'match.protocol.commands.pot.record.pottedBallCount',
          actor: playerRefB,
          params: { pottedBallCount: '+2' },
        },
        correction: { type: 'command.correct', fixedInput: { targetSeq: 2, targetCommandId: potCommandId } },
      },
    })
    expect(result).not.toHaveProperty('protocolRows')
    expect(result).not.toHaveProperty('state')
    expect(result).not.toHaveProperty('gameResult')
    expect(calls).toBe(2)
  })

  test('reads Protocol with its own durable presentation without a Controls call', async () => {
    const commandId = newCommandId()

    const { game } = createMatch({
      matchId,
      gameKey: 'free-pyramid',
      targets: state.targets,
      firstBreakerSeat: 'A',
    }).controlProjection()

    if (game?.gameKey !== 'free-pyramid') throw new Error('Expected prepared pyramid gameplay')
    let calls = 0

    const room = selectedClient({
      getProtocol: async () => {
        calls += 1

        return {
          _tag: 'active',
          latestSeq: 2,
          state: { ...state, currentFrameIndex: 1 },
          game,
          protocolEntries: [
            {
              acceptedSeq: 1,
              entryIndex: 0,
              causedByCommandId: commandId,
              acceptedAt: createdAt,
              frameIndex: 1,
              gameKey: 'free-pyramid',
              source: 'player',
              entryType: 'player-command',
              seat: 'A',
              body: { commandType: 'pot.record', pottedBallCount: 1 },
            },
            {
              acceptedSeq: 2,
              entryIndex: 0,
              causedByCommandId: newCommandId(),
              acceptedAt: createdAt,
              frameIndex: 1,
              gameKey: 'free-pyramid',
              source: 'player',
              entryType: 'player-command',
              seat: 'B',
              body: { commandType: 'pot.record', pottedBallCount: 1 },
            },
          ],
        }
      },
    })

    const result = await sparring(room).readMatchProtocol(matchId, 'en', 'free-pyramid')

    expect(result).toMatchObject({
      ok: true,
      lifecycle: 'active',
      controlPhase: 'frame-active',
      latestSeq: 2,
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 0, B: 0 } },
      game: { gameKey: 'free-pyramid', details: { phase: 'not-started' } },
      protocolRows: [{ key: 'protocol-2-0' }, { key: 'protocol-1-0' }],
    })
    expect(result).not.toHaveProperty('controls')
    expect(result).not.toHaveProperty('lastCommand')
    expect(result).not.toHaveProperty('state')
    expect(result).not.toHaveProperty('gameResult')
    expect(calls).toBe(1)
  })

  test('reads finalizing controls from MatchRoom without archiving', async () => {
    const events: string[] = []
    const nextDayClock = new FixedClock(new Date('2023-11-15T22:30:00.000Z'), 'Europe/Kyiv')

    const room = selectedClient({
      getControls: async () => ({
        _tag: 'finalizing',
        state: transfer.finalState,
        gameResult: null,
        latestSeq: 2,
        endedAt: transfer.endedAt,
      }),
    })

    const result = await sparring(room, events, { overrides: { clock: nextDayClock } }).readMatch(
      matchId,
      'en',
      'free-pyramid',
    )

    expect(result).toMatchObject({
      ok: true,
      lifecycle: 'finished',
      winnerSeat: 'A',
      latestSeq: 2,
      resultScores: { kind: 'frames', rows: [{ index: 1, score: { A: 0, B: 0 } }] },
      endedAtIso: '2023-11-14T22:13:21.000Z',
      endedAtTime: '00:13',
      endedAtDate: { year: '2023', month: '11', day: '15' },
      endedAtIsToday: false,
    })

    for (const field of ['endedAt', 'state', 'gameResult', 'hasCustomFrameTarget', 'protocolRows'])
      expect(result).not.toHaveProperty(field)
    expect(events).toEqual([])
  })

  test('enriches archived reads from D1 only and preserves forward Protocol chronology', async () => {
    const events: string[] = []

    const app = sparring(selectedClient(), events, {
      initialStatus: 'finished',
      overrides: {
        matchRoomClient: () => {
          throw new Error('Finished reads must not select MatchRoom')
        },
      },
      matches: {
        findFinishedArchive: async () => {
          events.push('finished-read')

          return { sourceLatestSeq: 2, state: transfer.finalState, gameResult: null }
        },
        findProtocolArchive: async () => {
          events.push('protocol-read')

          return {
            sourceLatestSeq: 2,
            state: transfer.finalState,
            gameResult: null,
            protocolVersion: 1,
            entries: [
              {
                acceptedSeq: 1,
                entryIndex: 0,
                causedByCommandId: newCommandId(),
                acceptedAt: createdAt,
                frameIndex: 1,
                gameKey: 'free-pyramid',
                source: 'player',
                entryType: 'player-command',
                seat: 'B',
                body: { commandType: 'pot.record', pottedBallCount: 2 },
              },
              {
                acceptedSeq: 2,
                entryIndex: 0,
                causedByCommandId: newCommandId(),
                acceptedAt: transfer.endedAt,
                frameIndex: 1,
                gameKey: 'free-pyramid',
                source: 'system',
                entryType: 'match-ended',
                seat: 'A',
                body: {},
              },
            ],
          }
        },
      },
    })

    const control = await app.readMatch(matchId, 'en', 'free-pyramid')
    expect(control).toMatchObject({
      ok: true,
      lifecycle: 'finished',
      winnerSeat: 'A',
      latestSeq: 2,
      resultScores: { kind: 'frames', rows: [{ index: 1, score: { A: 0, B: 0 } }] },
      endedAtIso: '2023-11-14T22:13:21.000Z',
      endedAtIsToday: true,
    })
    expect(control).not.toHaveProperty('protocolRows')
    const protocol = await app.readMatchProtocol(matchId, 'en', 'free-pyramid')
    expect(protocol).toMatchObject({
      ok: true,
      lifecycle: 'finished',
      latestSeq: 2,
      winnerSeat: 'A',
      representedFrame: { frameIndex: 1, pointsBySeat: { A: 0, B: 0 } },
      protocolRows: [{ key: 'protocol-1-0' }, { key: 'protocol-2-0' }],
    })

    for (const field of [
      'state',
      'gameResult',
      'controls',
      'lastCommand',
      'resultScores',
      'gameConfiguration',
      'endedAtIso',
      'endedAtTime',
      'endedAtDate',
      'endedAtIsToday',
      'hasCustomFrameTarget',
    ])
      expect(protocol).not.toHaveProperty(field)

    for (const field of ['state', 'gameResult', 'hasCustomFrameTarget', 'gameConfiguration'])
      expect(control).not.toHaveProperty(field)
    expect(events).toEqual(['finished-read', 'protocol-read'])
  })

  test('reads finalizing Protocol when the Match ends between room calls without archiving', async () => {
    const events: string[] = []

    const room = selectedClient({
      getProtocol: async () => ({
        _tag: 'finalizing',
        state: {
          ...transfer.finalState,
          gameKey: 'free-pyramid-long',
          gameConfiguration: { rackRollover: 14 },
        },
        gameResult: { gameKey: 'free-pyramid-long', racks: [{ rackNumber: 1, scoreBySeat: { A: 0, B: 0 } }] },
        latestSeq: 2,
        endedAt: transfer.endedAt,
        protocolEntries: [
          {
            acceptedSeq: 2,
            entryIndex: 0,
            causedByCommandId: newCommandId(),
            acceptedAt: transfer.endedAt,
            frameIndex: 1,
            gameKey: 'free-pyramid-long',
            source: 'system',
            entryType: 'match-ended',
            seat: 'A',
            body: {},
          },
        ],
      }),
    })

    const app = sparring(room, events, {
      matches: {
        findMatch: async () => ({
          matchId,
          gameKey: 'free-pyramid-long',
          createdAt,
          status: 'active',
          participantRefs: { A: playerRefA, B: playerRefB },
        }),
      },
    })

    const result = await app.readMatchProtocol(matchId, 'en', 'free-pyramid-long')
    expect(result).toMatchObject({
      ok: true,
      lifecycle: 'finished',
      winnerSeat: 'A',
      latestSeq: 2,
      protocolRows: [{ key: 'protocol-2-0', message: { key: 'match.protocol.system.match-ended' } }],
    })

    for (const field of ['state', 'gameResult', 'resultScores', 'gameConfiguration', 'endedAtIso'])
      expect(result).not.toHaveProperty(field)
    expect(events).toEqual([])
  })

  test('assembles between-frames payloads from one selected room response per read', async () => {
    const calls: string[] = []

    const projection = {
      _tag: 'active' as const,
      state: {
        ...state,
        targets: { ...state.targets, matchTargetFrames: 2 },
        framesWonBySeat: { A: 1, B: 0 },
        frames: [{ ...state.frames[0]!, winnerSeat: 'A' as const }],
      },
      latestSeq: 7,
      game: undefined,
    }

    const app = sparring(
      selectedClient({
        getControls: async () => {
          calls.push('controls')

          return { ...projection, controls: [], lastCommand: null }
        },
        getProtocol: async () => {
          calls.push('protocol')

          return { ...projection, protocolEntries: [] }
        },
      }),
    )

    for (const read of ['readMatch', 'readMatchProtocol'] as const) {
      const result = await app[read](matchId, 'en', 'free-pyramid')
      expect(result).toMatchObject({
        ok: true,
        gameKey: 'free-pyramid',
        lifecycle: 'active',
        controlPhase: 'between-frames',
        latestSeq: 7,
        winnerSeat: null,
        framesWonBySeat: { A: 1, B: 0 },
        representedFrame: { frameIndex: 1, pointsBySeat: { A: 0, B: 0 } },
      })

      for (const field of ['state', 'gameResult', 'game', 'resultScores'])
        expect(result).not.toHaveProperty(field)
    }

    expect(calls).toEqual(['controls', 'protocol'])
  })
})

async function readFailure(
  app: ReturnType<typeof sparring>,
  read: 'readMatch' | 'readMatchProtocol',
): Promise<Error> {
  try {
    await app[read](matchId, 'en', 'free-pyramid')
  } catch (error) {
    if (!(error instanceof Error)) throw error

    return error
  }

  throw new Error('Expected Match read to reject')
}
