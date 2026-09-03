import type { MatchId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BrandWordmark } from '../components/BrandWordmark'
import { BurgerMenu } from '../components/BurgerMenu'
import { matchControlUrl, matchProtocolUrl } from './match-urls'

type Props = {
  active: 'control' | 'protocol'
  gameKey: RegisteredGameKey
  matchId: MatchId
  matchStatus: 'active' | 'finished'
}

export function MatchNavigation(props: Props) {
  const { t } = useTranslation()
  const itemClass =
    'flex h-14 flex-1 items-center justify-center border-b-2 text-center text-base font-medium lg:flex-none lg:px-6'
  const activeClass = `${itemClass} border-primary text-foreground`
  const inactiveClass = `${itemClass} border-transparent text-muted-foreground hover:text-foreground`

  return (
    <nav className="sticky top-0 z-40 flex h-14 shrink-0 bg-deep">
      <BrandWordmark className="mx-5 hidden h-10 self-center lg:block" title={t(keys.appTitle)} />
      {props.active === 'control' ? (
        <span className={activeClass}>{t(keys.match.sparring.tabControl)}</span>
      ) : props.matchStatus === 'active' ? (
        <Link to={matchControlUrl(props.gameKey, props.matchId)} className={inactiveClass}>
          {t(keys.match.sparring.tabControl)}
        </Link>
      ) : (
        <span className={inactiveClass}>{t(keys.match.sparring.tabControl)}</span>
      )}
      {props.active === 'protocol' ? (
        <span className={activeClass}>{t(keys.match.sparring.tabProtocol)}</span>
      ) : (
        <Link to={matchProtocolUrl(props.gameKey, props.matchId)} className={inactiveClass}>
          {t(keys.match.sparring.tabProtocol)}
        </Link>
      )}
      <Link to="/sparring/matches/" className={`${inactiveClass} hidden lg:flex`}>
        {t(keys.nav.allMatches)}
      </Link>
      <div className="hidden flex-1 lg:block" />
      <div className="flex-1 lg:flex-none lg:px-2">
        <BurgerMenu placement="navigation" />
      </div>
    </nav>
  )
}
