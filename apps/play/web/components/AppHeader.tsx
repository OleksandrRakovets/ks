import { keys, type I18nKey } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { useMatches, Link, type UIMatch } from 'react-router'

import { BurgerMenu } from './BurgerMenu'

export type HeaderConfig = {
  title?: string
  titleKey?: I18nKey
  titleParams?: Record<string, string>
  backTo?: string
}

type HeaderHandle = { headerConfig?: (data: UIMatch['loaderData']) => HeaderConfig }

function BackArrowIcon() {
  return (
    <svg width="10" height="18" viewBox="0 0 7 12" fill="none" aria-hidden>
      <path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AppHeader() {
  const matches = useMatches()
  const { t } = useTranslation()

  const config =
    [...matches].reverse().reduce<HeaderConfig | null>((found, match) => {
      if (found) return found
      // SAFETY: Route handles in this app expose only the optional headerConfig convention declared here.
      const handle = match.handle as HeaderHandle | undefined
      return handle?.headerConfig?.(match.loaderData) ?? null
    }, null) ?? {}

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-divider bg-deep ">
      <div className="w-12">
        {config.backTo ? (
          <Link to={config.backTo} aria-label={t(keys.nav.back)} className="flex h-14 items-center px-4 text-green">
            <BackArrowIcon />
          </Link>
        ) : null}
      </div>

      <div className="flex-1 truncate text-center text-base font-semibold tracking-[0.01em]">
        {config.titleKey ? t(config.titleKey, config.titleParams) : (config.title ?? t(keys.appTitle))}
      </div>

      <div className="flex w-12 justify-end">
        <BurgerMenu />
      </div>
    </header>
  )
}
