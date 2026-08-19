import { describe, expect, test } from 'bun:test'

import { createMatchRoomClient } from './match-room-client'

const matchId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

describe('MatchRoom external namespace boundary', () => {
  test('selects the namespace object by match ID and validates snapshot responses', async () => {
    const selectedNames: string[] = []
    const client = createMatchRoomClient({
      getByName(name) {
        selectedNames.push(name)
        return {
          async snapshot() {
            return { ok: true, snapshot: 'malformed' }
          },
        }
      },
    })

    expect(await client.snapshot(matchId)).toEqual({
      ok: false,
      error: 'Failed to parse snapshot response',
      status: 502,
    })
    expect(selectedNames).toEqual([matchId])
  })
})
