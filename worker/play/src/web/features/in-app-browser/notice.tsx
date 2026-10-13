import { keys } from '@ks/i18n'
import { useId, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'
import { cn } from '@/components/ui/utils'

/**
 * Always server-rendered and hidden; the inline detection script's `<html>` attributes reveal it
 * and select the app instruction and device links before first paint.
 */
export function InAppBrowserNotice({ fullHeight }: { fullHeight: boolean }) {
  const { t } = useTranslation()
  const titleId = useId()
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [copyUrl, setCopyUrl] = useState('')
  // The fragment exists only in the browser, so links get their destination after hydration.
  const href = useSyncExternalStore(subscribe, getHref, getServerHref)

  async function copyLink() {
    const url = window.location.href

    try {
      await navigator.clipboard.writeText(url)
      setCopyStatus('copied')
    } catch {
      setCopyUrl(url)
      setCopyStatus('failed')
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'hidden shrink-0 flex-col justify-center bg-warning px-5 py-5 text-background scheme-dark [html[data-in-app-browser]_&]:flex',
        fullHeight ? 'min-h-dvh px-6 py-8' : 'min-h-[33.333dvh]',
      )}
    >
      <div className={cn('mx-auto flex w-full max-w-lg flex-col', fullHeight ? 'gap-6' : 'gap-3')}>
        <h2
          id={titleId}
          className={cn(
            'font-bold text-balance',
            fullHeight ? 'text-[32px] leading-[1.1]' : 'text-[22px] leading-tight',
          )}
        >
          {t(keys.app.inAppBrowser.title)}
        </h2>
        {fullHeight ? <p className="text-lg text-pretty">{t(keys.app.inAppBrowser.reason)}</p> : null}
        <div className="flex flex-col gap-3">
          <div className="hidden flex-col gap-3 [html[data-in-app-device=ios]_&]:flex">
            <BrowserLink href={href?.replace(/^(https?):/, 'x-safari-$1:')}>
              {t(keys.app.inAppBrowser.openSafari)}
            </BrowserLink>
            <BrowserLink href={href?.replace(/^http(s?):/, 'googlechrome$1:')}>
              {t(keys.app.inAppBrowser.openChrome)}
            </BrowserLink>
          </div>
          <div className="hidden flex-col gap-3 [html[data-in-app-device=android]_&]:flex">
            <BrowserLink href={href === null ? undefined : `${androidIntent(href)}end`}>
              {t(keys.app.inAppBrowser.openBrowser)}
            </BrowserLink>
            <BrowserLink
              href={href === null ? undefined : `${androidIntent(href)}package=com.android.chrome;end`}
            >
              {t(keys.app.inAppBrowser.openChrome)}
            </BrowserLink>
          </div>
          <Button size="touch" className={buttonClassName} onClick={() => void copyLink()}>
            {t(keys.app.inAppBrowser.copyLink)}
          </Button>
          <output className={copyStatus === 'idle' ? 'sr-only' : 'text-base text-pretty'}>
            {copyStatus === 'copied'
              ? t(keys.app.inAppBrowser.copied)
              : copyStatus === 'failed'
                ? t(keys.app.inAppBrowser.copyFailed)
                : null}
          </output>
          {copyStatus === 'failed' ? (
            <input
              aria-label={t(keys.app.inAppBrowser.link)}
              value={copyUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-12 w-full rounded-md border border-background/50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-background/40"
            />
          ) : null}
        </div>
        <p className="hidden text-base text-pretty [html[data-in-app-browser=telegram]_&]:block">
          {t(keys.app.inAppBrowser.telegramInstruction)}
        </p>
        <p className="hidden text-base text-pretty [html[data-in-app-browser=whatsapp]_&]:block">
          {t(keys.app.inAppBrowser.whatsappInstruction)}
        </p>
        <p className="hidden text-base text-pretty [html[data-in-app-browser=instagram]_&]:block">
          {t(keys.app.inAppBrowser.instagramInstruction)}
        </p>
        <p className="hidden text-base text-pretty [html[data-in-app-browser=unknown]_&]:block">
          {t(keys.app.inAppBrowser.genericInstruction)}
        </p>
      </div>
    </section>
  )
}

const buttonClassName =
  'w-full bg-background text-warning hover:bg-background/90 focus-visible:border-background focus-visible:ring-background/40'

function BrowserLink({ href, children }: { href: string | undefined; children: string }) {
  return (
    <Button
      nativeButton={false}
      render={<a href={href} aria-label={children} />}
      size="touch"
      className={buttonClassName}
    >
      {children}
    </Button>
  )
}

function androidIntent(href: string) {
  // Keep the original fragment before the final #Intent marker. No URL fallback: Telegram may
  // load it internally instead of handing off. Copy link remains available.
  return `${href.replace(/^https?:/, 'intent:')}#Intent;scheme=${new URL(href).protocol.slice(0, -1)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;`
}

function getHref() {
  return window.location.href
}

function getServerHref(): null {
  return null
}

function subscribe() {
  // The notice remounts per location; the URL does not change while it is mounted.
  return () => {}
}
