import { describe, expect, test } from 'bun:test'

import { createMatch } from '@ks/competition'
import { FixedClock, newCommandId } from '@ks/core'

import { createdAt, matchId, playerRefB, selectedClient, sparring, state, transfer } from './sparring.fixtures'

describe('sparring match and Protocol reads', () => {
  test('reads canonical active controls without RPC reparsing or a Protocol call', async () => {
    const match = createMatch({
      matchId,
      gameKey: state.gameKey,
      targets: state.targets,
      firstBreakerSeat: 'A',
    })

    const { game, controls } = match.controlProjection()

    if (game?.gameKey !== 'free-pyramid') throw new Error('Expected prepared pyramid gameplay')

    const room = selectedClient({
      getControls: async () => ({
        _tag: 'active',
        latestSeq: 0,
        state,
        game,
        controls,
        lastCommand: null,
      }),
    })

    expect(await sparring(room).readMatch(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      lifecycle: 'active',
      controlPhase: 'frame-active',
      latestSeq: 0,
      state,
    })
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

    const room = selectedClient({
      getControls: async () => {
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
    expect(await app.readMatch(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      lifecycle: 'active',
      controlPhase: 'frame-active',
      latestSeq: 0,
      state: { status: 'active', frames: [{ pointsBySeat: { A: 0, B: 0 } }] },
      game: { gameKey: 'free-pyramid', details: { phase: 'not-started' } },
    })
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
      state: { status: 'active', frames: [{ pointsBySeat: { A: 0, B: 2 } }] },
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
  })

  test('reads Protocol with its own durable presentation without a Controls call', async () => {
    const commandId = newCommandId()

    const room = selectedClient({
      getProtocol: async () => ({
        _tag: 'active',
        latestSeq: 2,
        state: { ...state, currentFrameIndex: 1 },
        game: undefined,
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
      }),
    })

    const result = await sparring(room).readMatchProtocol(matchId, 'en', 'free-pyramid')

    expect(result).toMatchObject({
      ok: true,
      latestSeq: 2,
      state: { currentFrameIndex: 1 },
      protocolRows: [{ key: 'protocol-2-0' }, { key: 'protocol-1-0' }],
    })
    expect(result).not.toHaveProperty('controls')
    expect(result).not.toHaveProperty('lastCommand')
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
      state: { status: 'finished', winnerSeat: 'A' },
      latestSeq: 2,
      endedAtIso: '2023-11-14T22:13:21.000Z',
      endedAtTime: '00:13',
      endedAtDate: { year: '2023', month: '11', day: '15' },
      endedAtIsToday: false,
    })
    expect(result).not.toHaveProperty('endedAt')
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
        getFinishedMatchArchive: async () => {
          events.push('finished-read')

          return { sourceLatestSeq: 2, state: transfer.finalState, gameResult: null }
        },
        getProtocolArchive: async () => {
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
      state: { status: 'finished' },
      latestSeq: 2,
      endedAtIso: '2023-11-14T22:13:21.000Z',
      endedAtIsToday: true,
      hasCustomFrameTarget: false,
    })
    expect(control).not.toHaveProperty('protocolRows')
    const protocol = await app.readMatchProtocol(matchId, 'en', 'free-pyramid')
    expect(protocol).toMatchObject({
      ...control,
      protocolRows: [{ key: 'protocol-1-0' }, { key: 'protocol-2-0' }],
    })
    expect(protocol).not.toHaveProperty('controls')
    expect(events).toEqual(['finished-read', 'protocol-read'])
  })

  test('reads finalizing Protocol when the Match ends between room calls without archiving', async () => {
    const events: string[] = []

    const room = selectedClient({
      getProtocol: async () => ({
        _tag: 'finalizing',
        state: transfer.finalState,
        gameResult: null,
        latestSeq: 2,
        endedAt: transfer.endedAt,
        protocolEntries: [
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
      }),
    })

    expect(await sparring(room, events).readMatchProtocol(matchId, 'en', 'free-pyramid')).toMatchObject({
      ok: true,
      state: { status: 'finished', winnerSeat: 'A' },
      latestSeq: 2,
      protocolRows: [{ key: 'protocol-2-0', message: { key: 'match.protocol.system.match-ended' } }],
    })
    expect(events).toEqual([])
  })
})
