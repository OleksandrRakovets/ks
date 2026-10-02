import { describe, expect, test } from 'bun:test'

import { matchId, selectedClient, sparring } from './sparring.fixtures'

describe('sparring live admission', () => {
  test('admits only active Matches to their live transport', async () => {
    await sparring(selectedClient()).admitMatchLive(matchId)

    expect(
      sparring(selectedClient(), [], { initialStatus: 'finished' }).admitMatchLive(matchId),
    ).rejects.toHaveProperty('_tag', 'MatchFinished')
  })
})
