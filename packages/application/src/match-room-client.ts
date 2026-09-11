import type { MatchId } from '@ks/core'
import type { MatchRoom } from '@ks/match-room'

// Derive the private capability from MatchRoom's server methods so RPC types have one source of truth.
// Play's generated binding verifies transport compatibility; the type-only import adds no runtime dependency.
export type MatchRoomClient = Pick<
  MatchRoom,
  'initialize' | 'submitCommand' | 'getControls' | 'getProtocol' | 'prepareArchive' | 'finalize'
>

export type MatchRoomInitializationInput = Parameters<MatchRoomClient['initialize']>[0]
export type MatchRoomCompletionTransfer = Awaited<ReturnType<MatchRoomClient['prepareArchive']>>

export type MatchRoomNamespace = {
  getByName(name: MatchId): MatchRoomClient
}
