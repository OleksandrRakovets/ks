import { describe, expect, test } from 'bun:test'

import { matchId, selectedClient, sparring } from './sparring.fixtures'

describe('sparring live admission', () => {
  test('admits only active Matches to their live transport and hides discarded ones', async () => {
    expect(await sparring(selectedClient()).admitMatchLive(matchId)).toEqual({
      _tag: 'admitted',
    })
    expect(
      await sparring(selectedClient(), [], { initialStatus: 'finished' }).admitMatchLive(matchId),
    ).toEqual({ _tag: 'finished' })
    // selectedClient throws on any room call, so a discarded row must stay out of MatchRoom.
    expect(
      await sparring(selectedClient(), [], { initialStatus: 'discarded' }).admitMatchLive(matchId),
    ).toEqual({ _tag: 'unknown' })
  })
})
