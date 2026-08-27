import { describe, expect, test } from 'bun:test'

import { CommandIdSchema, emptyControlCommandSections, newMatchId } from '@ks/core'
import * as v from 'valibot'

import { createMatchRoomClient } from './match-room-client'

const matchId = newMatchId()
const state = {
  matchId,
  gameKey: 'free-pyramid' as const,
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  status: 'active' as const,
  currentFrameIndex: 0,
  framesWonBySeat: { A: 0, B: 0 },
  frames: [],
}

function clientReturning<T extends object>(result: T) {
  const stub = {
    create: async () => result,
    readControl: async () => result,
    readProtocol: async () => result,
    submitCommand: async () => result,
    stream: async () => new Response(),
    finalization: async () => result,
    disposeFinalized: async () => result,
  }
  return createMatchRoomClient({ getByName: () => stub })
}

describe('MatchRoom client boundary', () => {
  test('accepts sequence-zero control reads', async () => {
    const result = { ok: true as const, latestSeq: 0, state, controlSections: emptyControlCommandSections() }
    expect(await clientReturning(result).readControl(matchId, 'free-pyramid')).toEqual(result)
  })

  test('rejects mismatched Protocol identity', async () => {
    const result = { ok: true, latestSeq: 0, state: { ...state, matchId: newMatchId() }, protocolEntries: [] }
    expect(await clientReturning(result).readProtocol(matchId, 'free-pyramid')).toEqual({
      ok: false,
      error: 'Invalid MatchRoom response',
      status: 502,
    })
  })

  test('decodes accepted sequence receipts', async () => {
    const result = { ok: true as const, outcome: { _tag: 'accepted' as const, acceptedSeq: 1 } }
    expect(
      await clientReturning(result).submitCommand(matchId, v.parse(CommandIdSchema, '01ARZ3NDEKTSV4RRFFQ69G5FAC'), {
        source: 'match',
        commandType: 'frame.prepare',
        command: {},
      }),
    ).toEqual(result)
  })
})
