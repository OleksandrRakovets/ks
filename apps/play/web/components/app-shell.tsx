import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BrandWordmark } from '@/components/brand-wordmark'
import { BurgerMenu } from '@/components/burger-menu'
import { localizedPath } from '@/i18n'
import { useRootLocale } from '@/root'

export function AppShell() {
  const { t } = useTranslation()
  const locale = useRootLocale()

  return (
    <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center justify-between bg-background px-4">
      <Link
        to={localizedPath('/sparring/', locale)}
        className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <BrandWordmark className="h-[34px] w-auto" title={t(keys.appTitle)} />
      </Link>
      <BurgerMenu />
    </header>
  )
}
