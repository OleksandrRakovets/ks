import type { MatchId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BrandWordmark } from '../components/BrandWordmark'
import { BurgerMenu } from '../components/BurgerMenu'
import { cn } from '../components/ui/utils'
import { localizedPath } from '../locale'
import { useRootLocale } from '../root'
import { matchControlUrl, matchProtocolUrl } from './match-urls'

type Props = {
  active: 'control' | 'protocol'
  gameKey: RegisteredGameKey
  matchId: MatchId
  matchStatus: 'active' | 'finished'
}

export function MatchNavigation(props: Props) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const itemClass =
    'flex h-12 flex-1 items-center justify-center border-b-2 text-center text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset lg:h-14 lg:flex-none lg:px-6'
  const activeClass = cn(itemClass, 'border-primary text-foreground')
  const inactiveClass = cn(itemClass, 'border-transparent text-muted-foreground hover:text-foreground')

  return (
    <nav className="sticky top-0 z-40 flex h-12 shrink-0 bg-deep lg:h-14">
      <BrandWordmark className="mx-5 hidden h-10 self-center lg:block" title={t(keys.appTitle)} />
      {props.active === 'control' ? (
        <span aria-current="page" className={activeClass}>
          {t(keys.match.sparring.tabControl)}
        </span>
      ) : props.matchStatus === 'active' ? (
        <Link to={matchControlUrl(props.gameKey, props.matchId, locale)} className={inactiveClass}>
          {t(keys.match.sparring.tabControl)}
        </Link>
      ) : (
        <span className={inactiveClass}>{t(keys.match.sparring.tabControl)}</span>
      )}
      {props.active === 'protocol' ? (
        <span aria-current="page" className={activeClass}>
          {t(keys.match.sparring.tabProtocol)}
        </span>
      ) : (
        <Link to={matchProtocolUrl(props.gameKey, props.matchId, locale)} className={inactiveClass}>
          {t(keys.match.sparring.tabProtocol)}
        </Link>
      )}
      <Link to={localizedPath('/sparring/matches/', locale)} className={cn(inactiveClass, 'hidden lg:flex')}>
        {t(keys.nav.allMatches)}
      </Link>
      <div className="hidden flex-1 lg:block" />
      <div className="flex-1 lg:flex-none lg:px-2">
        <BurgerMenu placement="navigation" />
      </div>
    </nav>
  )
}
