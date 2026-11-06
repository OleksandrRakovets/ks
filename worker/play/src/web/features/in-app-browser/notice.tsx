import { keys } from '@ks/i18n'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'
import { cn } from '@/components/ui/utils'
import type { InAppBrowser } from '@/features/in-app-browser/use-in-app-browser'

export function InAppBrowserNotice({ browser, fullHeight }: { browser: InAppBrowser; fullHeight: boolean }) {
  const { t } = useTranslation()
  const titleId = useId()
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [copyUrl, setCopyUrl] = useState('')
  // The notice only mounts after browser-local detection, never during SSR.
  const browserLinks = getBrowserLinks(window.location.href, navigator.userAgent, navigator.maxTouchPoints)

  const instruction = {
    telegram: keys.app.inAppBrowser.telegramInstruction,
    whatsapp: keys.app.inAppBrowser.whatsappInstruction,
    instagram: keys.app.inAppBrowser.instagramInstruction,
    unknown: keys.app.inAppBrowser.genericInstruction,
  }[browser]

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
        'flex shrink-0 flex-col justify-center bg-warning px-5 py-5 text-background scheme-dark',
        fullHeight ? 'min-h-dvh px-6 py-8' : 'min-h-[33.333dvh]',
      )}
    >
      <div className={cn('mx-auto flex w-full max-w-lg flex-col', fullHeight ? 'gap-6' : 'gap-3')}>
        <h2
          id={titleId}
          className={cn('leading-tight font-bold text-balance', fullHeight ? 'text-[32px]' : 'text-[22px]')}
        >
          {t(fullHeight ? keys.app.inAppBrowser.fullTitle : keys.app.inAppBrowser.compactTitle)}
        </h2>
        {fullHeight ? <p className="text-lg text-pretty">{t(keys.app.inAppBrowser.reason)}</p> : null}
        <p className="text-base text-pretty">{t(instruction)}</p>
        <div className="flex flex-col gap-3">
          {browserLinks.map(({ label, href }) => (
            <Button
              key={label}
              nativeButton={false}
              render={<a href={href} aria-label={t(label)} />}
              size="touch"
              className="w-full bg-background text-warning hover:bg-background/90 focus-visible:border-background focus-visible:ring-background/40"
            >
              {t(label)}
            </Button>
          ))}
          <Button
            size="touch"
            className="w-full bg-background text-warning hover:bg-background/90 focus-visible:border-background focus-visible:ring-background/40"
            onClick={() => void copyLink()}
          >
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
              aria-label={t(keys.app.inAppBrowser.copyLink)}
              value={copyUrl}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-12 w-full rounded-md border border-background/50 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-background/40"
            />
          ) : null}
          {fullHeight && copyStatus === 'idle' ? (
            <p className="text-base text-pretty">{t(keys.app.inAppBrowser.pasteInstruction)}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function getBrowserLinks(href: string, userAgent: string, maxTouchPoints: number) {
  const url = new URL(href)

  if (/Android/i.test(userAgent)) {
    // Keep the original fragment before the final #Intent marker. No URL fallback: Telegram
    // may load it internally instead of handing off. Copy link remains available below.
    const intent = `${href.replace(/^https?:/, 'intent:')}#Intent;scheme=${url.protocol.slice(0, -1)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;`

    return [
      { label: keys.app.inAppBrowser.openBrowser, href: `${intent}end` },
      { label: keys.app.inAppBrowser.openChrome, href: `${intent}package=com.android.chrome;end` },
    ]
  }

  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    return [
      ...(url.protocol === 'https:'
        ? [{ label: keys.app.inAppBrowser.openSafari, href: href.replace(/^https:/, 'x-safari-https:') }]
        : []),
      {
        label: keys.app.inAppBrowser.openChrome,
        href: href.replace(/^https?:/, url.protocol === 'https:' ? 'googlechromes:' : 'googlechrome:'),
      },
    ]
  }

  return []
}
