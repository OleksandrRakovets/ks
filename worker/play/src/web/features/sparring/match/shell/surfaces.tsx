import type { MatchId } from '@ks/core'
import type { GameKey } from '@ks/gameplay/definitions'
import { keys, type SupportedLocale } from '@ks/i18n'
import type { TFunction } from 'i18next'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Board } from '@/features/sparring/match/shell/board'
import { presentActiveSurface, presentFinishedBoard } from '@/features/sparring/match/shell/presentation'
import { Shell, type ShellNavigation } from '@/features/sparring/match/shell/shell'
import type { ActiveMatchData, ActiveProtocolData, FinishedSurfaceData } from '@/features/sparring/match/types'
import { matchProtocolUrl, matchUrl } from '@/features/sparring/urls'
import { localizedPath } from '@/i18n'
import { useRootLocale } from '@/root'

type SurfaceContent = Pick<ComponentProps<typeof Shell>, 'active' | 'children' | 'footer'>

export function ActiveSurface<K extends GameKey>(
  props: SurfaceContent & {
    data: ActiveMatchData<K> | ActiveProtocolData<K>
    layout: 'fixed' | 'reading'
    headerControl?: ReactNode
  },
) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const presentation = presentActiveSurface(props.data, t)

  return (
    <Shell
      active={props.active}
      layout={props.layout}
      header={{
        kind: 'match',
        ...presentation.header,
        // Operators always return to the live list, wherever they entered the match from.
        exit: { to: localizedPath('/sparring/matches/', locale), label: t(keys.match.control.exit) },
        control: props.headerControl,
      }}
      navigation={navigationFor(props.data, locale, t, t(keys.match.sparring.tabControl))}
      board={<Board presentation={presentation.board} />}
      footer={props.footer}
    >
      {props.children}
    </Shell>
  )
}

export function FinishedSurface(props: SurfaceContent & { data: FinishedSurfaceData }) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const board = presentFinishedBoard(props.data, t)

  return (
    <Shell
      active={props.active}
      layout="reading"
      header={{ kind: 'app' }}
      navigation={navigationFor(props.data, locale, t, t(keys.match.result.tabResult))}
      board={<Board presentation={board} />}
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
    label: t(keys.appTitle),
    primary: { to: matchUrl(identity.gameKey, identity.matchId, locale), label: primaryLabel },
    protocol: {
      to: matchProtocolUrl(identity.gameKey, identity.matchId, locale),
      label: t(keys.match.sparring.tabProtocol),
    },
  }
}
