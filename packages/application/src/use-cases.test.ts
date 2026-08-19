import { describe, expect, test } from 'bun:test'

import { PlayerRefSchema, type ControlCommand } from '@ks/core'
import * as v from 'valibot'

import { createMatchRoomClient, type MatchRoomCreateRequest } from './match-room-client'
import { createApplicationWithDependencies } from './use-cases'

const matchId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const controlSecret = 'control-secret-1234567890'
const playerRefA = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')
const playerRefB = v.parse(PlayerRefSchema, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB')

function unused(): never {
  throw new Error('Unexpected dependency call')
}

describe('application orchestration', () => {
  test('creates both guest players before creating the room with generated credentials', async () => {
    const playerNames: string[] = []
    let roomRequest: MatchRoomCreateRequest | undefined
    const room = {
      async create(request: MatchRoomCreateRequest) {
        roomRequest = request
        return { ok: true as const, matchId, controlSecret }
      },
      snapshot: unused,
      facts: unused,
      stream: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: () => matchId,
      newControlSecret: () => controlSecret,
      getOrCreateGuestPlayerRef: async (displayName) => {
        playerNames.push(displayName)
        return displayName === 'Alice Smith' ? playerRefA : playerRefB
      },
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchParticipantRefs: unused,
      getMatchControlSecret: unused,
      listStoredFacts: unused,
      getProtocolArchive: unused,
      matchRoom: createMatchRoomClient({ getByName: () => room }),
    })

    const result = await application.createMatch({
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 9 }, matchTargetFrames: 3 },
      firstBreakerSeat: 'B',
      playerNames: { A: 'Alice Smith', B: 'Bob Jones' },
    })

    expect(result).toEqual({ ok: true, matchId, controlSecret })
    expect(playerNames).toEqual(['Alice Smith', 'Bob Jones'])
    expect(roomRequest).toEqual({
      matchId,
      controlSecret,
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 9 }, matchTargetFrames: 3 },
      firstBreakerSeat: 'B',
      participants: [
        { seat: 'A', playerRef: playerRefA },
        { seat: 'B', playerRef: playerRefB },
      ],
    })
  })

  test('loads the control secret and submits commands to the selected room', async () => {
    const command: ControlCommand = { source: 'match', commandType: 'frame.start', command: {} }
    const calls: unknown[][] = []
    const room = {
      create: unused,
      snapshot: unused,
      async facts(args: { matchId: string; controlSecret: string; commands: ControlCommand[] }) {
        calls.push([args.matchId, args.controlSecret, args.commands])
        return { ok: true as const, accepted: [{ seq: 3, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }] }
      },
      stream: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: unused,
      newControlSecret: unused,
      getOrCreateGuestPlayerRef: unused,
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchParticipantRefs: unused,
      getMatchControlSecret: async (selectedMatchId) => {
        calls.push(['secret', selectedMatchId])
        return controlSecret
      },
      listStoredFacts: unused,
      getProtocolArchive: unused,
      matchRoom: createMatchRoomClient({ getByName: () => room }),
    })

    const result = await application.commandMatch(`m_${matchId}`, [command])

    expect(result).toEqual({ ok: true, accepted: [{ seq: 3, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }] })
    expect(calls).toEqual([
      ['secret', matchId],
      [matchId, controlSecret, [command]],
    ])
  })

  test('rejects a malformed command response at the MatchRoom adapter boundary', async () => {
    const room = {
      create: unused,
      snapshot: unused,
      async facts() {
        return { ok: true, accepted: 'not-an-array' }
      },
      stream: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: unused,
      newControlSecret: unused,
      getOrCreateGuestPlayerRef: unused,
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchParticipantRefs: unused,
      getMatchControlSecret: async () => controlSecret,
      listStoredFacts: unused,
      getProtocolArchive: unused,
      matchRoom: createMatchRoomClient({ getByName: () => room }),
    })

    expect(await application.commandMatch(matchId, [])).toEqual({
      ok: false,
      error: 'Failed to parse command response',
      status: 502,
    })
  })

  test('does not call MatchRoom when command authorization data is absent', async () => {
    const application = createApplicationWithDependencies({
      newMatchId: unused,
      newControlSecret: unused,
      getOrCreateGuestPlayerRef: unused,
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchParticipantRefs: unused,
      getMatchControlSecret: async () => null,
      listStoredFacts: unused,
      getProtocolArchive: unused,
      matchRoom: createMatchRoomClient({ getByName: unused }),
    })

    expect(await application.commandMatch(matchId, [])).toEqual({ ok: false, error: 'unknown-match', status: 400 })
  })
})
