import { expect } from 'bun:test'

import { projectMatchScore, ProtocolEntries } from '@ks/competition'
import { FixedClock, MatchId, newCommandId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import * as v from 'valibot'

import type { MatchRoomArchiveTransfer, MatchRoomClient } from '../match/match-room'
import { createSparringApplication, type SparringDependencies } from './sparring-application'

export const matchId = v.parse(MatchId, '01ARZ3NDEKTSV4RRFFQ69G5FAV')

export const playerRefA = v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')

export const playerRefB = v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB')

export const participants = {
  A: { playerRef: playerRefA, displayName: 'Alice Alpha', shortDisplayName: 'A. Alpha' },
  B: { playerRef: playerRefB, displayName: 'Bob Beta', shortDisplayName: 'B. Beta' },
}

export const participantRecords = {
  A: {
    playerRef: playerRefA,
    names: {
      uk: { firstName: 'Аліса', lastName: 'Альфа' },
      en: { firstName: 'Alice', lastName: 'Alpha' },
    },
  },
  B: {
    playerRef: playerRefB,
    names: {
      uk: { firstName: 'Боб', lastName: 'Бета' },
      en: { firstName: 'Bob', lastName: 'Beta' },
    },
  },
}

export const createdAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)

const clock = new FixedClock(new Date(createdAt), 'Europe/Kyiv')

export const state = {
  matchId,
  gameKey: 'free-pyramid' as const,
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  status: 'active' as const,
  winnerSeat: null,
  currentFrameIndex: 1,
  framesWonBySeat: { A: 0, B: 0 },
  frames: [{ frameIndex: 1, breakerSeat: 'A' as const, pointsBySeat: { A: 0, B: 0 } }],
}

const endedAt = v.parse(UnixEpochMilliseconds, 1_700_000_001_000)

const commenceCommandId = newCommandId()

const concedeCommandId = newCommandId()

/** The Protocol MatchRoom stores for commencement by A and a match-ending concession by B. */
const protocolEntries = v.parse(ProtocolEntries, [
  {
    acceptedSeq: 1,
    entryIndex: 0,
    causedByCommandId: commenceCommandId,
    acceptedAt: v.parse(UnixEpochMilliseconds, 1_700_000_000_500),
    gameKey: 'free-pyramid',
    frameIndex: 1,
    source: 'player',
    entryType: 'player-command',
    seat: 'A',
    body: { commandType: 'frame.commence' },
  },
  {
    acceptedSeq: 2,
    entryIndex: 0,
    causedByCommandId: concedeCommandId,
    acceptedAt: endedAt,
    gameKey: 'free-pyramid',
    frameIndex: 1,
    source: 'player',
    entryType: 'frame-conceded',
    seat: 'B',
    scoreAfter: { A: 0, B: 0 },
    body: {},
  },
  {
    acceptedSeq: 2,
    entryIndex: 1,
    causedByCommandId: concedeCommandId,
    acceptedAt: endedAt,
    gameKey: 'free-pyramid',
    frameIndex: 1,
    source: 'system',
    entryType: 'frame-awarded',
    seat: 'A',
    scoreAfter: { A: 0, B: 0 },
    body: { winReason: 'conceded' },
  },
  {
    acceptedSeq: 2,
    entryIndex: 2,
    causedByCommandId: concedeCommandId,
    acceptedAt: endedAt,
    gameKey: 'free-pyramid',
    frameIndex: 1,
    source: 'system',
    entryType: 'match-ended',
    seat: 'A',
    body: {},
  },
])

export const transfer: MatchRoomArchiveTransfer = {
  matchId,
  gameKey: 'free-pyramid',
  createdAt,
  sourceLatestSeq: 2,
  endedAt,
  protocolEntries,
  finalState: {
    ...state,
    status: 'finished',
    winnerSeat: 'A',
    framesWonBySeat: { A: 1, B: 0 },
    frames: [{ ...state.frames[0]!, winnerSeat: 'A' }],
  },
  gameResult: null,
}

export function selectedClient(overrides: Partial<MatchRoomClient> = {}): MatchRoomClient {
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected MatchRoom call')
  }

  return {
    initialize: unexpected,
    discard: unexpected,
    getControls: unexpected,
    getProtocol: unexpected,
    getScore: unexpected,
    submitCommand: unexpected,
    prepareArchive: unexpected,
    ...overrides,
  }
}

export function sparring(
  room: MatchRoomClient,
  events: string[] = [],
  options: {
    initialStatus?: 'active' | 'finished' | 'discarded'
    overrides?: Partial<Omit<SparringDependencies, 'players' | 'matches'>>
    players?: Partial<SparringDependencies['players']>
    matches?: Partial<SparringDependencies['matches']>
  } = {},
) {
  let status = options.initialStatus ?? ('active' as const)
  let discardedAt = transfer.endedAt

  const matchRecord = () => {
    const identity = {
      matchId,
      gameKey: 'free-pyramid' as const,
      createdAt,
      participantRefs: { A: playerRefA, B: playerRefB },
    }

    return status === 'finished'
      ? {
          ...identity,
          status,
          endedAt: transfer.endedAt,
          finalSourceLatestSeq: transfer.sourceLatestSeq,
          finalScore: projectMatchScore(transfer.finalState),
        }
      : status === 'discarded'
        ? { ...identity, status, endedAt: discardedAt }
        : { ...identity, status }
  }

  return createSparringApplication({
    clock,
    newMatchId: () => matchId,
    newControlSecret: () => 'control-secret-1234567890',
    players: {
      ensureGuestRef: async (name) => (name.firstName === 'A' ? playerRefA : playerRefB),
      readParticipant: async (playerRef) => ({
        playerRef,
        names: null,
      }),
      ...options.players,
    },
    matches: {
      listLive: async () => [],
      listFinished: async () => [],
      findFinishedTime: async () => null,
      findMatch: async () => matchRecord(),
      listMatches: async () => [matchRecord()],
      findFinishedArchive: async () => ({
        sourceLatestSeq: transfer.sourceLatestSeq,
        state: transfer.finalState,
        gameResult: null,
      }),
      findProtocolArchive: async () => ({
        sourceLatestSeq: transfer.sourceLatestSeq,
        protocolVersion: 1,
        entries: transfer.protocolEntries,
        state: transfer.finalState,
        gameResult: null,
      }),
      beginCreation: async () => {
        events.push('begin')
      },
      activate: async () => {
        events.push('activate')
      },
      archiveFinished: async () => {
        events.push('archive')
      },
      markFinished: async () => {
        events.push('finish')
        status = 'finished'
      },
      markDiscarded: async (_matchId, endedAt) => {
        events.push('discard')
        status = 'discarded'
        discardedAt = endedAt
      },
      ...options.matches,
    },
    matchRoomClient: (selectedMatchId) => {
      expect(selectedMatchId).toBe(matchId)

      return room
    },
    ...options.overrides,
  })
}
