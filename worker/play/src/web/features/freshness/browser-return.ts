export type BrowserReturnHint = 'visible' | 'pageshow' | 'focus' | 'online'

/**
 * Subscribes to browser hints that a live page may have been hidden, frozen, or offline.
 *
 * `onHide` permits brief synchronous cleanup only: browsers give it no portable time budget, and a
 * mobile OS may terminate the process without firing it. `onReturn` fires only while the document
 * is visible, possibly several times for one return, so owners must coalesce it. A persisted
 * `pageshow` counts as a return even when no hide event preceded it.
 */
export function watchBrowserReturn(handlers: {
  onHide(): void
  onReturn(hint: BrowserReturnHint): void
}): () => void {
  let hidden = false

  const hide = () => {
    hidden = true
    handlers.onHide()
  }

  const resume = (hint: BrowserReturnHint) => {
    if (document.visibilityState !== 'visible') return
    hidden = false
    handlers.onReturn(hint)
  }

  const visibilityChange = () => {
    if (document.visibilityState === 'hidden') hide()
    else resume('visible')
  }

  const pageShow = (event: PageTransitionEvent) => {
    if (event.persisted || hidden) resume('pageshow')
  }

  const focus = () => resume('focus')
  const online = () => resume('online')

  document.addEventListener('visibilitychange', visibilityChange)
  window.addEventListener('pagehide', hide)
  window.addEventListener('pageshow', pageShow)
  window.addEventListener('focus', focus)
  window.addEventListener('online', online)

  return () => {
    document.removeEventListener('visibilitychange', visibilityChange)
    window.removeEventListener('pagehide', hide)
    window.removeEventListener('pageshow', pageShow)
    window.removeEventListener('focus', focus)
    window.removeEventListener('online', online)
  }
}
