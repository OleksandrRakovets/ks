import { describe, expect, test } from 'bun:test'

import { UnixEpochMillisecondsSchema, newCommandId, PlayerRefSchema, type ControlCommand } from '@ks/core'
import * as v from 'valibot'

import type { MatchRoomCreateRequest } from './match-room-client'
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
    const createdAt = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_000)
    const lifecycle: unknown[] = []
    const playerNames: string[] = []
    let roomRequest: MatchRoomCreateRequest | undefined
    const room = {
      async create(request: MatchRoomCreateRequest) {
        lifecycle.push(['room', request.createdAt])
        roomRequest = request
        return { ok: true as const, matchId }
      },
      snapshot: unused,
      command: unused,
      facts: unused,
      stream: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: () => matchId,
      newControlSecret: () => controlSecret,
      now: () => createdAt,
      getOrCreateGuestPlayerRef: async (displayName) => {
        playerNames.push(displayName)
        return displayName === 'Alice Smith' ? playerRefA : playerRefB
      },
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchParticipantRefs: unused,
      listActiveFacts: unused,
      getProtocolArchive: unused,
      beginMatchCreation: async (input) => {
        lifecycle.push(['begin', input.createdAt])
      },
      activateMatch: async (id) => {
        lifecycle.push(['activate', id])
      },
      recordCompletedMatch: unused,
      matchRoom: room,
    })

    const result = await application.createMatch({
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 9 }, matchTargetFrames: 3 },
      firstBreakerSeat: 'B',
      playerNames: { A: 'Alice Smith', B: 'Bob Jones' },
    })

    expect(result).toEqual({ ok: true, matchId })
    expect(playerNames).toEqual(['Alice Smith', 'Bob Jones'])
    expect(roomRequest).toEqual({
      matchId,
      controlSecret,
      createdAt,
      gameKey: 'free-pyramid',
      targets: { frameTargetPointsBySeat: { A: 8, B: 9 }, matchTargetFrames: 3 },
      firstBreakerSeat: 'B',
      participants: [
        { seat: 'A', playerRef: playerRefA },
        { seat: 'B', playerRef: playerRefB },
      ],
    })
    expect(lifecycle).toEqual([
      ['begin', createdAt],
      ['room', createdAt],
      ['activate', matchId],
    ])
  })

  test('submits commands to the selected room without a control secret', async () => {
    const command: ControlCommand = { source: 'match', commandType: 'frame.start', command: {} }
    const calls: unknown[][] = []
    const room = {
      create: unused,
      snapshot: unused,
      async command(matchId: string, commandId: string, command: ControlCommand) {
        calls.push([matchId, commandId, command])
        return { ok: true as const, accepted: [{ seq: 3, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }] }
      },
      facts: unused,
      stream: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: unused,
      newControlSecret: unused,
      now: unused,
      getOrCreateGuestPlayerRef: unused,
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchParticipantRefs: unused,
      listActiveFacts: unused,
      getProtocolArchive: unused,
      beginMatchCreation: unused,
      activateMatch: unused,
      recordCompletedMatch: unused,
      matchRoom: room,
    })

    const commandId = newCommandId()
    const result = await application.commandMatch(`m_${matchId}`, commandId, command)

    expect(result).toEqual({ ok: true, accepted: [{ seq: 3, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }] })
    expect(calls).toEqual([[matchId, commandId, command]])
  })

  test('archives terminal commands from the private room descriptor without exposing it', async () => {
    const endedAt = v.parse(UnixEpochMillisecondsSchema, 1_700_000_000_999)
    const archived: unknown[] = []
    const room = {
      create: unused,
      snapshot: unused,
      async command() {
        return {
          ok: true as const,
          accepted: [{ seq: 9, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }],
          completion: { sourceLatestSeq: 9, endedAt },
        }
      },
      async facts() {
        return []
      },
      stream: unused,
    }
    const application = createApplicationWithDependencies({
      newMatchId: unused,
      newControlSecret: unused,
      now: unused,
      getOrCreateGuestPlayerRef: unused,
      hydrateParticipant: unused,
      listMatchRecords: unused,
      getMatchParticipantRefs: unused,
      listActiveFacts: unused,
      getProtocolArchive: unused,
      beginMatchCreation: unused,
      activateMatch: unused,
      recordCompletedMatch: async (input) => {
        archived.push(input)
      },
      matchRoom: room,
    })

    const result = await application.commandMatch(matchId, newCommandId(), {
      source: 'match',
      commandType: 'match.end',
      command: {},
    })

    expect(result).toEqual({ ok: true, accepted: [{ seq: 9, factId: '01ARZ3NDEKTSV4RRFFQ69G5FAC' }] })
    expect(archived).toEqual([
      {
        matchId,
        sourceLatestSeq: 9,
        endedAt,
        protocolVersion: 1,
        rowsJson: '[]',
      },
    ])
  })
})
