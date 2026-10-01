import type { MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import { keys, type SupportedLocale } from '@ks/i18n'
import type { TFunction } from 'i18next'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { matchProtocolUrl, matchUrl } from '@/features/sparring/urls'
import { localizedPath } from '@/i18n'
import { useRootLocale } from '@/root'

import type { ActiveMatchData, ActiveProtocolData, FinishedMatchData } from '../types'
import { Board } from './board'
import { presentActiveSurface, presentFinishedSurface } from './presentation'
import { Shell, type ShellNavigation } from './shell'

type SurfaceContent = Pick<ComponentProps<typeof Shell>, 'active' | 'children' | 'headerControl' | 'footer'>

export function ActiveSurface<K extends GameKey>(
  props: SurfaceContent & {
    data: ActiveMatchData<K> | ActiveProtocolData<K>
    layout: 'fixed' | 'reading'
  },
) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const presentation = presentActiveSurface(props.data, t)

  return (
    <Shell
      active={props.active}
      layout={props.layout}
      header={presentation.header}
      navigation={navigationFor(props.data.state, locale, t, t(keys.match.sparring.tabControl))}
      board={<Board presentation={presentation.board} />}
      headerControl={props.headerControl}
      footer={props.footer}
    >
      {props.children}
    </Shell>
  )
}

export function FinishedSurface(props: SurfaceContent & { data: FinishedMatchData }) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const presentation = presentFinishedSurface(props.data, t)

  return (
    <Shell
      active={props.active}
      layout="reading"
      header={presentation.header}
      navigation={navigationFor(props.data.state, locale, t, t(keys.match.result.tabResult))}
      board={<Board presentation={presentation.board} />}
      headerControl={props.headerControl}
      footer={props.footer}
    >
      {props.children}
    </Shell>
  )
}

function navigationFor(
  identity: { gameKey: GameKey; matchId: MatchId },
  locale: SupportedLocale,
  t: TFunction,
  primaryLabel: string,
): ShellNavigation {
  return {
    exitTo: localizedPath('/sparring/matches/', locale),
    exitLabel: t(keys.match.control.exit),
    label: t(keys.appTitle),
    primary: { to: matchUrl(identity.gameKey, identity.matchId, locale), label: primaryLabel },
    protocol: {
      to: matchProtocolUrl(identity.gameKey, identity.matchId, locale),
      label: t(keys.match.sparring.tabProtocol),
    },
  }
}
