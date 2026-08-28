import { CreateMatchRequestSchema } from '@ks/competition'
import { newCommandId, newMatchId, PlayerRef, UnixEpochMilliseconds } from '@ks/core'
import { env } from 'cloudflare:test'
import * as v from 'valibot'

export const request = v.parse(CreateMatchRequestSchema, {
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA') },
    { seat: 'B', playerRef: v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAB') },
  ],
})
export const controlSecret = 'control-secret-1234567890'
export const createdAt = v.parse(UnixEpochMilliseconds, 1_700_000_000_000)

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

export function terminalCommand() {
  return {
    commandId: newCommandId(),
    source: 'match' as const,
    command: { type: 'frame.concede', seat: 'B' },
  }
}

export async function finalizeRoom(stub: ReturnType<typeof env.MATCH_ROOM.getByName>) {
  await stub.submitCommand(prepareCommand())
  await stub.submitCommand(commenceCommand())
  const command = terminalCommand()
  await stub.submitCommand(command)
  return command
}

export async function readEvent(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const result = await reader.read()
  return result.done ? '' : new TextDecoder().decode(result.value)
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
