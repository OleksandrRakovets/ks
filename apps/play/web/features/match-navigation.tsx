import type { MatchId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { BrandWordmark } from '../components/BrandWordmark'
import { BurgerMenu } from '../components/BurgerMenu'
import { NavigationLink } from '../components/ui'
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

  return (
    <nav className="sticky top-0 z-40 flex min-h-12 shrink-0 border-b border-border bg-background/95 backdrop-blur lg:min-h-14">
      <BrandWordmark className="mx-5 hidden h-10 self-center lg:block" title={t(keys.appTitle)} />
      <NavigationLink
        render={
          props.matchStatus === 'active' ? (
            <Link to={matchControlUrl(props.gameKey, props.matchId, locale)} />
          ) : undefined
        }
        state={props.active === 'control' ? 'active' : props.matchStatus === 'active' ? 'default' : 'disabled'}
        className="flex-1 justify-center lg:flex-none"
      >
        {t(keys.match.sparring.tabControl)}
      </NavigationLink>
      <NavigationLink
        render={<Link to={matchProtocolUrl(props.gameKey, props.matchId, locale)} />}
        state={props.active === 'protocol' ? 'active' : 'default'}
        className="flex-1 justify-center lg:flex-none"
      >
        {t(keys.match.sparring.tabProtocol)}
      </NavigationLink>
      <NavigationLink
        render={<Link to={localizedPath('/sparring/matches/', locale)} />}
        className="hidden lg:flex"
      >
        {t(keys.nav.allMatches)}
      </NavigationLink>
      <div className="hidden flex-1 lg:block" />
      <div className="flex flex-1 items-center justify-center lg:flex-none">
        <BurgerMenu placement="navigation" />
      </div>
    </nav>
  )
}
