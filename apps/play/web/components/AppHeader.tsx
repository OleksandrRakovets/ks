import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'

import { localizedPath } from '../locale'
import { useRootLocale } from '../root'
import { BrandWordmark } from './BrandWordmark'
import { BurgerMenu } from './BurgerMenu'
import { NavigationLink } from './ui/v2'

export function AppHeader() {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const location = useLocation()
  const sparringPath = localizedPath('/sparring/', locale)
  const onNewMatch = location.pathname === sparringPath || location.pathname.startsWith(`${sparringPath}init/`)
  const onMatches = location.pathname === localizedPath('/sparring/matches/', locale)

  return (
    <header className="sticky top-0 z-40 flex min-h-12 shrink-0 border-b border-border bg-background/95 backdrop-blur lg:min-h-14">
      <div className="mx-5 hidden items-center lg:flex">
        <BrandWordmark className="h-10" title={t(keys.appTitle)} />
      </div>
      <NavigationLink
        render={<Link to={sparringPath} />}
        state={onNewMatch ? 'active' : 'default'}
        className="flex-1 justify-center lg:flex-none"
      >
        {t(keys.nav.newMatch)}
      </NavigationLink>
      <NavigationLink
        render={<Link to={localizedPath('/sparring/matches/', locale)} />}
        state={onMatches ? 'active' : 'default'}
        className="flex-1 justify-center lg:flex-none"
      >
        {t(keys.nav.allMatches)}
      </NavigationLink>
      <div className="hidden flex-1 lg:block" />
      <div className="flex flex-1 items-center justify-center lg:flex-none">
        <BurgerMenu placement="navigation" />
      </div>
    </header>
  )
}
