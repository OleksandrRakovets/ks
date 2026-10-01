import { describe, expect, test } from 'bun:test'

import { matchId, selectedClient, sparring } from './sparring.fixtures'

describe('sparring live admission', () => {
  test('admits only active Matches to their live transport', async () => {
    expect(await sparring(selectedClient()).admitMatchLive(matchId)).toEqual({
      _tag: 'admitted',
    })
    expect(
      await sparring(selectedClient(), [], { initialStatus: 'finished' }).admitMatchLive(matchId),
    ).toEqual({ _tag: 'finished' })
  })
})
