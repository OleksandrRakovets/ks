import { describe, expect, test } from 'bun:test'

import { navigationCookieValue, navigationFromCookie } from '@/features/pwa/navigation'

describe('navigation cookie', () => {
  test('stores the whole relative URL for seven days with host-local cookie attributes', () => {
    expect(navigationCookieValue(new URL('https://play.ks.ua/en/sparring/?game=strila-v2#rules'))).toBe(
      'ks.lastUrl=%2Fen%2Fsparring%2F%3Fgame%3Dstrila-v2%23rules; Path=/; SameSite=Lax; Max-Age=604800; Secure',
    )
    expect(navigationCookieValue(new URL('http://localhost:7529/'))).toBe(
      'ks.lastUrl=%2F; Path=/; SameSite=Lax; Max-Age=604800',
    )
  })

  test('restores any page without separating locale, query, or fragment', () => {
    for (const destination of [
      '/',
      '/en/',
      '/sparring/matches/finished/2026-10-07/',
      '/en/sparring/setup/strila-v2/?seatAName=Olha%20%26%20Co&seatBName=Ivan#targets',
      '/sparring/match/strila-v2/123/protocol/',
    ]) {
      expect(
        navigationFromCookie(
          `ks.theme=auto; ks.lastUrl=${encodeURIComponent(destination)}; other=1`,
          'https://play.ks.ua',
        ),
      ).toBe(destination)
    }
  })

  test('does not save or restore launch URLs, including encoded and normalized aliases', () => {
    for (const destination of [
      '/start',
      '/start/?from=icon#launch',
      '/START///',
      '/%73tart/',
      '/other/../start/',
    ]) {
      expect(navigationCookieValue(new URL(destination, 'https://play.ks.ua'))).toBeNull()
      expect(navigationFromCookie(`ks.lastUrl=${encodeURIComponent(destination)}`, 'https://play.ks.ua')).toBe(
        '/',
      )
    }
  })

  test('rejects external destinations and URL-parser whitespace or backslash tricks', () => {
    for (const destination of [
      'https://evil.example/',
      'https://play.ks.ua/en/',
      '//evil.example/',
      '/prefix/..//evil.example/',
      '/%2e%2e//evil.example/',
      '/\\evil.example/',
      '/\n/evil.example/',
      '/\t/evil.example/',
      'javascript:alert(1)',
      'sparring/',
    ]) {
      expect(navigationFromCookie(`ks.lastUrl=${encodeURIComponent(destination)}`, 'https://play.ks.ua')).toBe(
        '/',
      )
    }
  })

  test('falls back for absent, empty, or malformed cookies and does not confuse cookie names', () => {
    for (const cookie of [
      null,
      '',
      'other=1',
      'ks.lastUrl=',
      'ks.lastUrl=%ZZ',
      'ks.lastUrl=%2F%ZZ',
      'not.ks.lastUrl=%2Fen%2F',
    ]) {
      expect(navigationFromCookie(cookie, 'https://play.ks.ua')).toBe('/')
    }
  })
})
