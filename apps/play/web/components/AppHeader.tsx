import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'

import { BrandWordmark } from './BrandWordmark'
import { BurgerMenu } from './BurgerMenu'

export function AppHeader() {
  const { t } = useTranslation()
  const location = useLocation()
  const onNewMatch = location.pathname === '/sparring/' || location.pathname.startsWith('/sparring/init/')
  const onMatches = location.pathname === '/sparring/matches/'
  const itemClass =
    'flex h-14 flex-1 items-center justify-center border-b-2 text-base font-medium lg:flex-none lg:px-6'

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 border-b border-divider bg-deep">
      <div className="mx-5 hidden items-center lg:flex">
        <BrandWordmark className="h-10" title={t(keys.appTitle)} />
      </div>
      <Link
        to="/sparring/"
        className={`${itemClass} ${onNewMatch ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
      >
        {t(keys.nav.newMatch)}
      </Link>
      <Link
        to="/sparring/matches/"
        className={`${itemClass} ${onMatches ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
      >
        {t(keys.nav.allMatches)}
      </Link>
      <div className="hidden flex-1 lg:block" />
      <div className="flex-1 lg:flex-none lg:px-2">
        <BurgerMenu placement="navigation" />
      </div>
    </header>
  )
}
