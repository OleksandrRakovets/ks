import { describe, expect, test } from 'bun:test'

import { matchId, RoomInitialization, selectedClient, sparring, state } from './sparring.fixtures'

describe('sparring creation', () => {
  test('returns invalid-input before creating players, D1 rows, or a room', async () => {
    const events: string[] = []

    const app = sparring(selectedClient(), events, {
      overrides: {
        newMatchId: () => {
          throw new Error('Invalid input must not begin creation')
        },
      },
    })

    expect(
      await app.createMatch({
        gameKey: 'free-pyramid',
        targets: state.targets,
        firstBreakerSeat: 'A',
        playerNames: { A: 'Same Player', B: 'Same Player' },
      }),
    ).toEqual({ ok: false, reason: 'invalid-input' })
    expect(events).toEqual([])
  })

  test('returns initialization-conflict without activating D1', async () => {
    const events: string[] = []

    const room = selectedClient({
      initialize: async () => {
        events.push('initialize')

        return RoomInitialization['initialization-conflict']()
      },
    })

    expect(
      await sparring(room, events).createMatch({
        gameKey: 'free-pyramid',
        targets: state.targets,
        firstBreakerSeat: 'A',
        playerNames: { A: 'A Player', B: 'B Player' },
      }),
    ).toEqual({ ok: false, reason: 'initialization-conflict' })
    expect(events).toEqual(['begin', 'initialize'])
  })

  test('selects the room once for initialization and activates D1', async () => {
    const events: string[] = []

    const room = selectedClient({
      initialize: async (input) => {
        expect(input.matchId).toBe(matchId)
        events.push('initialize')

        return RoomInitialization.initialized({ matchId })
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
