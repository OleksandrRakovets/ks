import { expect } from 'bun:test'

import { projectMatchScore } from '@ks/competition'
import type { Clock } from '@ks/core'
import { FixedClock, MatchId, newCommandId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { Context, Effect, pipe } from 'effect'
import * as v from 'valibot'

import { ApplicationClock } from '../match/clock'
import { type MatchRoomArchiveTransfer, type MatchRoomClient, MatchRooms } from '../match/match-room'
import { PlayerStorage } from '../player/storage/player-storage'
import { MatchCreation } from './create-match'
import { createSparringApplication } from './sparring-application'
import { SparringMatchStorage } from './storage/sparring-match-storage'

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

export const transfer: MatchRoomArchiveTransfer = {
  matchId,
  gameKey: 'free-pyramid',
  createdAt,
  sourceLatestSeq: 1,
  endedAt: v.parse(UnixEpochMilliseconds, 1_700_000_001_000),
  protocolEntries: [],
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
    initialStatus?: 'active' | 'finished'
    overrides?: {
      clock?: Clock
      newMatchId?: () => MatchId
      newControlSecret?: () => string
      matchRoomClient?: (matchId: MatchId) => MatchRoomClient
    }
    players?: Partial<PromiseService<PlayerStorage['Service']>>
    matches?: Partial<PromiseService<SparringMatchStorage['Service']>>
  } = {},
) {
  let status = options.initialStatus ?? ('active' as const)

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
      : { ...identity, status }
  }

  const playerPromises: PromiseService<PlayerStorage['Service']> = {
    ensureGuestRef: async (name) => (name.firstName === 'A' ? playerRefA : playerRefB),
    readParticipant: async (playerRef) => ({
      playerRef,
      names: null,
    }),
    ...options.players,
  }

  const matchPromises: PromiseService<SparringMatchStorage['Service']> = {
    listLive: async () => [],
    listFinished: async () => [],
    findFinishedTime: async () => null,
    findMatch: async () => matchRecord(),
    listMatches: async () => [matchRecord()],
    findFinishedArchive: async () => ({
      sourceLatestSeq: 1,
      state: transfer.finalState,
      gameResult: null,
    }),
    findProtocolArchive: async () => ({
      sourceLatestSeq: 1,
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
          seat: 'A',
          body: { commandType: 'frame.commence' },
        },
      ],
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
    ...options.matches,
  }

  const players = PlayerStorage.of({
    ensureGuestRef: (name) => Effect.promise(() => playerPromises.ensureGuestRef(name)),
    readParticipant: (playerRef) => Effect.promise(() => playerPromises.readParticipant(playerRef)),
  })

  const matches = SparringMatchStorage.of({
    listLive: (input) => Effect.promise(() => matchPromises.listLive(input)),
    listFinished: (input) => Effect.promise(() => matchPromises.listFinished(input)),
    findFinishedTime: (input) => Effect.promise(() => matchPromises.findFinishedTime(input)),
    findMatch: (input) => Effect.promise(() => matchPromises.findMatch(input)),
    listMatches: (input) => Effect.promise(() => matchPromises.listMatches(input)),
    findFinishedArchive: (input) => Effect.promise(() => matchPromises.findFinishedArchive(input)),
    findProtocolArchive: (input) => Effect.promise(() => matchPromises.findProtocolArchive(input)),
    beginCreation: (input) => Effect.promise(() => matchPromises.beginCreation(input)),
    activate: (input) => Effect.promise(() => matchPromises.activate(input)),
    archiveFinished: (input) => Effect.promise(() => matchPromises.archiveFinished(input)),
    markFinished: (input) => Effect.promise(() => matchPromises.markFinished(input)),
  })

  const rooms = MatchRooms.of({
    get: (selectedMatchId) => {
      expect(selectedMatchId).toBe(matchId)
      const selected = options.overrides?.matchRoomClient?.(selectedMatchId) ?? room

      return {
        initialize: (input) => Effect.promise(() => selected.initialize(input)),
        getControls: () => Effect.promise(() => selected.getControls()),
        getProtocol: () => Effect.promise(() => selected.getProtocol()),
        getScore: () => Effect.promise(() => selected.getScore()),
        submitCommand: (command) => Effect.promise(() => selected.submitCommand(command)),
        prepareArchive: () => Effect.promise(() => selected.prepareArchive()),
      }
    },
  })

  const overrides = options.overrides

  const context = pipe(
    Context.make(ApplicationClock, overrides?.clock ?? clock),
    Context.add(MatchCreation, {
      newMatchId: overrides?.newMatchId ?? (() => matchId),
      newControlSecret: overrides?.newControlSecret ?? (() => 'control-secret-1234567890'),
    }),
    Context.add(PlayerStorage, players),
    Context.add(SparringMatchStorage, matches),
    Context.add(MatchRooms, rooms),
  )

  return createSparringApplication(context)
}

type PromiseService<Service> = {
  [Key in keyof Service]: Service[Key] extends (...args: infer Args) => Effect.Effect<infer Value, unknown>
    ? (...args: Args) => Promise<Value>
    : never
}
