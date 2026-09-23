import { CreateMatchRequest } from '@ks/competition'
import { newCommandId, newMatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { env } from 'cloudflare:workers'
import * as v from 'valibot'

const request = v.parse(CreateMatchRequest, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA') },
    { seat: 'B', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB') },
  ],
})

const controlSecret = 'control-secret-1234567890'

const createdAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)

export function initialization(matchId: ReturnType<typeof newMatchId>) {
  return { ...request, matchId, controlSecret, createdAt }
}

export async function initializedRoom() {
  const matchId = newMatchId()
  const stub = env.MATCH_ROOM.getByName(matchId)
  await stub.initialize(initialization(matchId))

  return { matchId, stub }
}

export function prepareCommand() {
  return { commandId: newCommandId(), source: 'match' as const, command: { type: 'frame.prepare' } }
}

export function commenceCommand() {
  return {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'frame.commence', seat: 'A' },
  }
}

export function matchEndingCommand() {
  return {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'frame.concede', seat: 'B' },
  }
}

export async function makeRoomFinalizing(stub: ReturnType<typeof env.MATCH_ROOM.getByName>) {
  await stub.submitCommand(prepareCommand())
  await stub.submitCommand(commenceCommand())
  const command = matchEndingCommand()
  await stub.submitCommand(command)

  return command
}

export async function captureRpcError(operation: () => Promise<void>): Promise<Error> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }

  throw new Error('Expected RPC operation to throw')
}
