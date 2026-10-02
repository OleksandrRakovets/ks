import type { MatchId } from '@ks/core'
import type { MatchRoom } from '@ks/match-room'
import { Context, Effect, Layer } from 'effect'

/** Private application capability; Play's generated binding verifies the concrete RPC stub. */
export type MatchRoomClient = Pick<
  MatchRoom,
  'initialize' | 'submitCommand' | 'getControls' | 'getProtocol' | 'getScore' | 'prepareArchive'
>

export type MatchRoomInitializationInput = Parameters<MatchRoomClient['initialize']>[0]

export type MatchRoomArchiveTransfer = Awaited<ReturnType<MatchRoomClient['prepareArchive']>>

export type MatchRoomNamespace = Pick<DurableObjectNamespace<MatchRoom>, 'getByName'>

/** RPC results remain semantic values. Rejected RPC promises retain their original defects. */
export class MatchRooms extends Context.Service<
  MatchRooms,
  { get(matchId: MatchId): EffectMatchRoomClient }
>()('@ks/application/match/match-room') {
  static layer(namespace: MatchRoomNamespace) {
    return Layer.succeed(this, {
      get(matchId) {
        const room = namespace.getByName(matchId)

        return {
          initialize: (input) => Effect.promise(async () => room.initialize(input)),
          submitCommand: (command) => Effect.promise(async () => room.submitCommand(command)),
          getControls: () => Effect.promise(async () => room.getControls()),
          getProtocol: () => Effect.promise(async () => room.getProtocol()),
          getScore: () => Effect.promise(async () => room.getScore()),
          prepareArchive: () => Effect.promise(async () => room.prepareArchive()),
        }
      },
    })
  }
}

type EffectMatchRoomClient = {
  [Method in keyof MatchRoomClient]: (
    ...args: Parameters<MatchRoomClient[Method]>
  ) => Effect.Effect<Awaited<ReturnType<MatchRoomClient[Method]>>>
}
