import { describe, expect, test } from 'bun:test'

import { matchControlCookie, matchControlCookieName, matchControlSecretFromCookie } from './match-control-cookie'

const matchId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

describe('match control credential cookie', () => {
  test('scopes an HTTP-only credential to one match control route', () => {
    expect(matchControlCookie(matchId, 'secret/value')).toBe(
      'ks_match_control_01ARZ3NDEKTSV4RRFFQ69G5FAV=secret%2Fvalue; Path=/sparring/matches/01ARZ3NDEKTSV4RRFFQ69G5FAV/; HttpOnly; SameSite=Lax',
    )
  })

  test('reads only the selected match credential', () => {
    const cookie = [
      `${matchControlCookieName(matchId)}=selected-secret`,
      `${matchControlCookieName('01ARZ3NDEKTSV4RRFFQ69G5FAW')}=other-secret`,
    ].join('; ')

    expect(matchControlSecretFromCookie(cookie, matchId)).toBe('selected-secret')
    expect(matchControlSecretFromCookie(cookie, '01ARZ3NDEKTSV4RRFFQ69G5FAX')).toBeNull()
  })
})
