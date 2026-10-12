import { expect, test } from 'bun:test'

import { newMatchId } from '@ks/core'

import { matchProtocolUrl, matchSetupUrl, matchUrl } from '@/features/sparring/urls'

test('sparring match links retain game keys and locale across control and Protocol pages', () => {
  const matchId = newMatchId()

  expect(matchUrl('combined-pyramid-old', matchId, 'uk')).toBe(
    `/sparring/match/combined-pyramid-old/${matchId}/`,
  )
  expect(matchProtocolUrl('free-pyramid-long', matchId, 'en')).toBe(
    `/en/sparring/match/free-pyramid-long/${matchId}/protocol/`,
  )
  expect(matchSetupUrl('strila-v2', 'en')).toBe('/en/sparring/setup/strila-v2/')
})
