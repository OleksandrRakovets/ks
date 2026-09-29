import type { MatchId } from '@ks/core'
import type { MatchRoom } from '@ks/match-room'

/** Private application capability; Play's generated binding verifies the concrete RPC stub. */
export type MatchRoomClient = Pick<
  MatchRoom,
  'initialize' | 'submitCommand' | 'getControls' | 'getProtocol' | 'getScore' | 'prepareArchive'
>

export type MatchRoomInitializationInput = Parameters<MatchRoomClient['initialize']>[0]

export type MatchRoomArchiveTransfer = Awaited<ReturnType<MatchRoomClient['prepareArchive']>>

export type MatchRoomNamespace = Pick<DurableObjectNamespace<MatchRoom>, 'getByName'>
