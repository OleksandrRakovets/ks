export type InAppBrowser = 'telegram' | 'whatsapp' | 'instagram' | 'unknown'

/**
 * Inline `<head>` script that marks `<html>` with `data-in-app-browser` and `data-in-app-device`
 * before first paint, so CSS reveals the server-rendered notice without shifting content.
 * Both functions are serialized with their source and must reference only browser globals.
 */
export const inAppBrowserScript = `(${markDocument.toString()})(${detectInAppBrowser.toString()})`

/** Repeats the inline detection after hydration in case a bridge was injected after `<head>`. */
export function markInAppBrowser() {
  markDocument(detectInAppBrowser)
}

/**
 * Positive heuristics only: null does not prove a normal browser or a durable cookie store.
 * Neither result is an identity or permission check.
 */
export function detectInAppBrowser(userAgent: string, hasTelegramBridge: boolean): InAppBrowser | null {
  if (hasTelegramBridge) return 'telegram'

  if (/\b(?:WAiOS|WA4A)\//i.test(userAgent)) return 'whatsapp'

  if (/\bInstagram\b/i.test(userAgent)) return 'instagram'

  if (/\bWebView\b|Android.*; wv\)/i.test(userAgent)) return 'unknown'

  return null
}

function markDocument(detect: typeof detectInAppBrowser) {
  const userAgent = navigator.userAgent

  const browser = detect(
    userAgent,
    'TelegramWebview' in window || 'TelegramWebviewProxy' in window || 'TelegramWebviewProxyProto' in window,
  )

  if (browser === null) return

  const root = document.documentElement
  root.dataset.inAppBrowser = browser
  root.dataset.inAppDevice = /Android/i.test(userAgent)
    ? 'android'
    : /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1)
      ? 'ios'
      : 'other'
}
