import { expect, test } from 'bun:test'

import { detectInAppBrowser } from '@/features/in-app-browser/use-in-app-browser'

test('Telegram bridge takes precedence over a Safari-looking or generic WebView user agent', () => {
  const safari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/22B5045g Safari/604.1'

  expect(detectInAppBrowser(safari, true)).toBe('telegram')
  expect(detectInAppBrowser(safari, false)).toBeNull()
  expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) Chrome/129.0', true)).toBe('telegram')
})

test('recognizes WhatsApp app tokens, not arbitrary mentions of the app name', () => {
  expect(detectInAppBrowser('Mozilla/5.0 WAiOS/2.25.1', false)).toBe('whatsapp')
  expect(detectInAppBrowser('Mozilla/5.0 WA4A/2.25.1', false)).toBe('whatsapp')
  expect(detectInAppBrowser('Mozilla/5.0 WhatsApp', false)).toBeNull()
})

test('Instagram is identified before the generic Android WebView fallback', () => {
  expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) Instagram 300.0', false)).toBe('instagram')
  expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Mobile/15E148 Instagram 300.0', false)).toBe('instagram')
})

test('only positive WebView markers trigger the generic notice', () => {
  expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) Chrome/129.0', false)).toBe('unknown')
  expect(detectInAppBrowser('Mozilla/5.0 WebView', false)).toBe('unknown')
  expect(
    detectInAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile Safari/537.36', false),
  ).toBeNull()
})
