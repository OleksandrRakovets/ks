import { groupControlsIntoSections, type MatchCommand } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { cn } from '@/components/ui/utils'
import { localizedPath } from '@/locale'
import { useRootLocale } from '@/root'

import { matchControlUrl, matchProtocolUrl } from '../../match-urls'
import { Board } from './board'
import { LastActionBar } from './last-action-bar'
import { OverflowSheet } from './overflow-sheet'
import type { MatchControlData } from './types'

export function MatchShell<K extends RegisteredGameKey>(props: {
  active: 'control' | 'protocol'
  data: MatchControlData<K>
  children: ReactNode
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const controlSections = groupControlsIntoSections(props.data.controls)

  return (
    <main className="mx-auto flex h-dvh w-full max-w-match flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-[52px] shrink-0 items-center gap-3 px-1.5">
        <Link
          to={localizedPath('/sparring/matches/', locale)}
          aria-label={t(keys.match.control.exit)}
          className="text-text-lo grid size-11 shrink-0 place-items-center rounded-lg outline-none hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <CloseIcon />
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <strong className="truncate text-[17px] leading-none font-semibold">
            {contextLabel(props.data, t)}
          </strong>
          <span className="shrink-0 text-base leading-none">{ruleLabel(props.data, t)}</span>
        </div>
        <OverflowSheet
          controls={controlSections.tertiary}
          names={{
            A: props.data.participants.A.displayName,
            B: props.data.participants.B.displayName,
          }}
          submitting={props.submitting}
          onSubmit={props.onSubmit}
        />
      </header>

      <Board data={props.data} />

      <div
        className={cn(
          'min-h-0 flex-1',
          props.active === 'control' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overscroll-contain',
        )}
      >
        {props.children}
      </div>

      {props.active === 'control' && props.data.controlState !== 'finished' && props.data.lastEntry ? (
        <LastActionBar entry={props.data.lastEntry} />
      ) : null}

      <nav
        className="grid h-14 shrink-0 grid-cols-2 gap-1 bg-background px-2 py-1.5"
        aria-label={t(keys.appTitle)}
      >
        <MatchTab
          active={props.active === 'control'}
          disabled={props.data.controlState === 'finished' && props.active !== 'control'}
          to={matchControlUrl(props.data.state.gameKey, props.data.state.matchId, locale)}
        >
          {t(keys.match.sparring.tabControl)}
        </MatchTab>
        <MatchTab
          active={props.active === 'protocol'}
          to={matchProtocolUrl(props.data.state.gameKey, props.data.state.matchId, locale)}
        >
          {t(keys.match.sparring.tabProtocol)}
        </MatchTab>
      </nav>
    </main>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden className="size-5" viewBox="0 0 20 20" fill="none">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MatchTab(props: { active: boolean; disabled?: boolean; to: string; children: ReactNode }) {
  const className = cn(
    'grid place-items-center rounded-lg text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    props.active ? 'bg-overlay text-foreground' : 'text-text-lo hover:text-foreground',
    props.disabled === true && 'opacity-45',
  )

  if (props.disabled === true) {
    return (
      <span aria-disabled className={className}>
        {props.children}
      </span>
    )
  }

  return (
    <Link to={props.to} aria-current={props.active ? 'page' : undefined} className={className}>
      {props.children}
    </Link>
  )
}

function contextLabel<K extends RegisteredGameKey>(
  data: MatchControlData<K>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (data.controlState === 'frame-active' && data.game.gameKey === 'free-pyramid-long') {
    return t(keys.match.control.longFreePyramid.rack, {
      rackNumber: data.game.details.currentRack.rackNumber,
    })
  }

  return t(keys.match.scoreboard.frameWithNumber, {
    frameIndex: Math.max(1, data.state.currentFrameIndex),
  })
}

function ruleLabel<K extends RegisteredGameKey>(
  data: MatchControlData<K>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (data.controlState === 'frame-active' && data.game.gameKey === 'free-pyramid-long') {
    return t(keys.match.control.longFreePyramid.rackRollover, {
      count: data.game.details.rackRollover,
    })
  }

  return t(keys.match.scoreboard.raceToWins, {
    targetFrames: data.state.targets.matchTargetFrames,
  })
}
