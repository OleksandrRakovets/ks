import { describe, expect, test } from 'bun:test'

import { matchId, selectedClient, sparring, state } from './sparring.fixtures'

describe('sparring creation', () => {
  test('selects the room once for initialization and activates D1', async () => {
    const events: string[] = []

    const room = selectedClient({
      initialize: async (input) => {
        expect(input.matchId).toBe(matchId)
        events.push('initialize')

        return { _tag: 'initialized', matchId }
      },
    })

    expect(
      await sparring(room, events).createMatch({
        gameKey: 'free-pyramid',
        targets: state.targets,
        firstBreakerSeat: 'A',
        playerNames: { A: 'A Player', B: 'B Player' },
      }),
    ).toEqual({ ok: true, matchId })
    expect(events).toEqual(['begin', 'initialize', 'activate'])
  })
})
