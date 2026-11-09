import { useSyncExternalStore } from 'react'

export type InAppBrowser = 'telegram' | 'whatsapp' | 'instagram' | 'unknown'

/**
 * Positive heuristics only: null does not prove a normal browser or a durable cookie store.
 * @internal Exported for detection contract tests; production callers use the hook below.
 */
export function detectInAppBrowser(userAgent: string, hasTelegramBridge: boolean): InAppBrowser | null {
  if (hasTelegramBridge) return 'telegram'

  if (/\b(?:WAiOS|WA4A)\//i.test(userAgent)) return 'whatsapp'

  if (/\bInstagram\b/i.test(userAgent)) return 'instagram'

  if (/\bWebView\b|Android.*; wv\)/i.test(userAgent)) return 'unknown'

  return null
}

/**
 * Browser-local detection, shared by renderers rather than serialized in loader data. Returns
 * null during SSR and initial hydration, or when no positive signal exists. unknown means a
 * detected but unidentified WebView. Neither is an identity or permission check; Telegram's
 * bridge is only available client-side.
 */
export function useInAppBrowser(): InAppBrowser | null {
  return useSyncExternalStore(subscribe, getBrowserSnapshot, getServerSnapshot)
}

function getBrowserSnapshot(): InAppBrowser | null {
  return detectInAppBrowser(
    navigator.userAgent,
    'TelegramWebview' in window || 'TelegramWebviewProxy' in window || 'TelegramWebviewProxyProto' in window,
  )
}

function getServerSnapshot(): null {
  return null
}

function subscribe() {
  // User-agent and document-start bridge signals do not change during the page's lifetime.
  return () => {}
}
