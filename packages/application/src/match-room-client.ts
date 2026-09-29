import type { MatchId } from '@ks/core'
import type { MatchRoom } from '@ks/match-room'

type MatchRoomRpcMethod =
  | 'initialize'
  | 'submitCommand'
  | 'getControls'
  | 'getProtocol'
  | 'getScore'
  | 'prepareArchive'

type MatchRoomStub = DurableObjectStub<MatchRoom>

type SerializableRpcMethod<Method extends MatchRoomRpcMethod> = [ReturnType<MatchRoomStub[Method]>] extends [
  never,
]
  ? never
  : MatchRoom[Method]

// Keep Cloudflare's custom thenables and disposal metadata out of Application while rejecting server methods that
// the generated client stub cannot serialize.
export type MatchRoomClient = {
  [Method in MatchRoomRpcMethod]: SerializableRpcMethod<Method>
}

export type MatchRoomInitializationInput = Parameters<MatchRoomClient['initialize']>[0]

export type MatchRoomArchiveTransfer = Awaited<ReturnType<MatchRoomClient['prepareArchive']>>

export type MatchRoomNamespace = {
  getByName(name: MatchId): MatchRoomClient
}
