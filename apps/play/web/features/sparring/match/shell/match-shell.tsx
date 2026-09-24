import { groupControlsIntoSections, type MatchCommand, type MatchId } from '@ks/core'
import type { RegisteredGameKey } from '@ks/gameplay/definitions'
import { keys } from '@ks/i18n'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { cn } from '@/components/ui/utils'
import type { ActiveMatchData, FinishedMatchData } from '@/features/sparring/match/types'
import { matchProtocolUrl, matchUrl } from '@/features/sparring/urls'
import { localizedPath } from '@/locale'
import { useRootLocale } from '@/root'

import { Board } from './board'
import { LastActionBar } from './last-action-bar'
import { OverflowSheet } from './overflow-sheet'
import { RematchAction } from './rematch-action'

export function MatchControlShell<K extends RegisteredGameKey>(props: {
  active: 'control' | 'protocol'
  data: ActiveMatchData<K>
  children: ReactNode
  submitting: boolean
  onSubmit: (command: MatchCommand) => void
}) {
  const { t } = useTranslation()
  const controlSections = groupControlsIntoSections(props.data.controls)

  return (
    <MatchShell
      active={props.active === 'control' ? 'primary' : 'protocol'}
      state={props.data.state}
      headerTitle={controlContextLabel(props.data, t)}
      headerRule={controlRuleLabel(props.data, t)}
      headerAction={
        <OverflowSheet
          controls={controlSections.tertiary}
          names={{
            A: props.data.participants.A.displayName,
            B: props.data.participants.B.displayName,
          }}
          submitting={props.submitting}
          onSubmit={props.onSubmit}
        />
      }
      board={<Board data={props.data} />}
      contentClassName={
        props.active === 'control' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overscroll-contain'
      }
      footer={
        props.active === 'control' && props.data.lastEntry ? (
          <LastActionBar entry={props.data.lastEntry} />
        ) : null
      }
      primaryTabLabel={t(keys.match.sparring.tabControl)}
    >
      {props.children}
    </MatchShell>
  )
}

export function MatchResultShell<K extends RegisteredGameKey>(props: {
  active: 'result' | 'protocol'
  data: FinishedMatchData<K>
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <MatchShell
      active={props.active === 'result' ? 'primary' : 'protocol'}
      state={props.data.state}
      headerTitle={props.data.shortGameTitle}
      headerRule={resultRuleLabel(props.data, t)}
      headerAction={null}
      board={null}
      contentClassName="overflow-y-auto overscroll-contain"
      footer={props.active === 'result' ? <RematchAction data={props.data} /> : null}
      primaryTabLabel={t(keys.match.result.tabResult)}
    >
      {props.children}
    </MatchShell>
  )
}

function MatchShell(props: {
  active: 'primary' | 'protocol'
  state: { readonly gameKey: RegisteredGameKey; readonly matchId: MatchId }
  headerTitle: string
  headerRule: string
  headerAction: ReactNode
  board: ReactNode
  contentClassName: string
  footer: ReactNode
  primaryTabLabel: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const locale = useRootLocale()

  return (
    <main className="mx-auto flex h-dvh w-full max-w-match flex-col overflow-hidden bg-background text-foreground">
      <header
        className={cn(
          'flex h-[52px] shrink-0 items-center gap-3 pl-1.5',
          props.headerAction === null ? 'pr-4' : 'pr-1.5',
        )}
      >
        <Link
          to={localizedPath('/sparring/matches/', locale)}
          aria-label={t(keys.match.control.exit)}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <CloseIcon />
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <strong className="truncate text-[17px] leading-none font-semibold">{props.headerTitle}</strong>
          <span className="shrink-0 text-base leading-none">{props.headerRule}</span>
        </div>
        {props.headerAction}
      </header>

      {props.board}

      <div className={cn('min-h-0 flex-1', props.contentClassName)}>{props.children}</div>

      {props.footer}

      <nav
        className="grid h-14 shrink-0 grid-cols-2 gap-1 bg-background px-2 py-1.5"
        aria-label={t(keys.appTitle)}
      >
        <MatchTab
          active={props.active === 'primary'}
          to={matchUrl(props.state.gameKey, props.state.matchId, locale)}
        >
          {props.primaryTabLabel}
        </MatchTab>
        <MatchTab
          active={props.active === 'protocol'}
          to={matchProtocolUrl(props.state.gameKey, props.state.matchId, locale)}
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

function MatchTab(props: { active: boolean; to: string; children: ReactNode }) {
  const className = cn(
    'grid place-items-center rounded-lg text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    props.active ? 'bg-overlay text-foreground' : 'text-muted-foreground hover:text-foreground',
  )

  return (
    <Link to={props.to} aria-current={props.active ? 'page' : undefined} className={className}>
      {props.children}
    </Link>
  )
}

function controlContextLabel<K extends RegisteredGameKey>(
  data: ActiveMatchData<K>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (data.controlPhase === 'frame-active' && data.game.gameKey === 'free-pyramid-long') {
    return t(keys.match.control.longFreePyramid.rack, {
      rackNumber: data.game.details.currentRack.rackNumber,
    })
  }

  return t(keys.match.scoreboard.frameWithNumber, {
    frameIndex: Math.max(1, data.state.currentFrameIndex),
  })
}

function controlRuleLabel<K extends RegisteredGameKey>(
  data: ActiveMatchData<K>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (data.controlPhase === 'frame-active' && data.game.gameKey === 'free-pyramid-long') {
    return t(keys.match.control.longFreePyramid.rackRollover, {
      count: data.game.details.rackRollover,
    })
  }

  return t(keys.match.scoreboard.raceToWins, {
    targetFrames: data.state.targets.matchTargetFrames,
  })
}

function resultRuleLabel<K extends RegisteredGameKey>(
  data: FinishedMatchData<K>,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const { frameTargetPointsBySeat, matchTargetFrames } = data.state.targets

  if (data.state.gameKey === 'free-pyramid-long') {
    const target =
      frameTargetPointsBySeat.A === frameTargetPointsBySeat.B
        ? frameTargetPointsBySeat.A
        : `${frameTargetPointsBySeat.A}/${frameTargetPointsBySeat.B}`

    return t(keys.match.scoreboard.target, { target })
  }

  const race = t(keys.match.scoreboard.target, { target: matchTargetFrames })

  if (!data.hasCustomFrameTarget) return race

  return `${race} (${frameTargetPointsBySeat.A}/${frameTargetPointsBySeat.B})`
}
