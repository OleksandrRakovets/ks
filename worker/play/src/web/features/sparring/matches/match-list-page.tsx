import {
  type MatchListEntry,
  type MatchListPage as MatchListPageData,
  type MatchScorePollEntry,
  MatchScorePollResponse,
} from '@ks/application'
import type { MatchScoreProjection } from '@ks/competition/definitions'
import type { BySeatNumber, MatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useRevalidator } from 'react-router'
import * as v from 'valibot'

import { Page } from '@/components/page'
import { Button, SegmentedNavigation, SegmentedNavigationLink } from '@/components/ui'
import { cn } from '@/components/ui/utils'
import { LiveListController } from '@/features/sparring/matches/live-list-controller'
import { matchUrl } from '@/features/sparring/urls'
import { localizedPath } from '@/i18n'
import { useRootLocale } from '@/root'

type MatchListView = 'live' | 'finished'

type MatchListUpdates =
  | {
      readonly kind: 'poll-scores'
      readonly matchIds: readonly MatchId[]
    }
  | { readonly kind: 'none' }

export type MatchListRouteData = {
  readonly view: MatchListView
  readonly page: MatchListPageData
  readonly updates: MatchListUpdates
}

export function MatchListPage({ data }: { data: MatchListRouteData }) {
  if (data.updates.kind === 'poll-scores') return <PollingMatchListPage data={data} updates={data.updates} />

  return <MatchListContent view={data.view} page={data.page} matches={data.page.matches} />
}

function PollingMatchListPage({
  data,
  updates,
}: {
  data: MatchListRouteData
  updates: Extract<MatchListUpdates, { kind: 'poll-scores' }>
}) {
  const [overrides, dispatch] = useReducer(scoreOverridesReducer, new Map())
  const { revalidate } = useRevalidator()
  const requestRevalidation = useCallback(() => revalidate(), [revalidate])

  const matches = useMemo(
    () => data.page.matches.map((match) => mergeMatchEntry(match, overrides.get(match.matchId))),
    [data.page.matches, overrides],
  )

  const pollableIds = useMemo(() => new Set(updates.matchIds), [updates.matchIds])

  const activeMatches = useMemo(
    () => matches.filter((match) => match.status === 'active' && pollableIds.has(match.matchId)),
    [matches, pollableIds],
  )

  useLiveMatchList(activeMatches, dispatch, requestRevalidation)

  return <MatchListContent view={data.view} page={data.page} matches={matches} />
}

function MatchListContent({
  view,
  page,
  matches,
}: {
  view: MatchListView
  page: MatchListPageData
  matches: readonly MatchListEntry[]
}) {
  const { t } = useTranslation()
  const locale = useRootLocale()

  return (
    <Page title={t(keys.nav.matches)} headerAction={<MatchListViewToggle view={view} locale={locale} />}>
      {page.scope === 'finished' && page.day !== null ? (
        <FinishedDayNavigation page={page} locale={locale} heading />
      ) : null}

      {matches.length === 0 ? (
        <p className="text-muted-foreground">
          {t(
            view === 'live'
              ? keys.match.sparring.noLiveMatches
              : page.scope === 'finished' && page.day !== null
                ? keys.match.sparring.noFinishedMatchesOnDay
                : keys.match.sparring.noFinishedMatches,
          )}
        </p>
      ) : (
        <MatchGrid>
          {matches.map((match) => (
            <MatchRow key={match.matchId} match={match} locale={locale} />
          ))}
        </MatchGrid>
      )}

      {page.scope === 'finished' && page.day !== null && matches.length > 10 ? (
        <FinishedDayNavigation page={page} locale={locale} />
      ) : null}
    </Page>
  )
}

function FinishedDayNavigation({
  page,
  locale,
  heading = false,
}: {
  page: Extract<MatchListPageData, { scope: 'finished' }>
  locale: 'uk' | 'en'
  heading?: boolean
}) {
  const { t } = useTranslation()

  if (page.day === null) return null

  const date = page.day
  const label = page.isToday ? t(keys.match.sparring.today) : localDateLabel(date)

  return (
    <nav aria-label={t(keys.match.sparring.days)} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      {page.previousDay === null ? (
        <span />
      ) : (
        <Button
          nativeButton={false}
          render={<Link to={matchListDayPath(locale, page.previousDay)} prefetch="intent" />}
          variant="outline"
          size="touch"
          className="min-w-12 gap-1 justify-self-start px-3"
        >
          <DayArrow />
          <span className="max-[370px]:sr-only">{t(keys.match.sparring.previousDay)}</span>
        </Button>
      )}
      {heading ? (
        <h2 className="px-2 py-2 text-center text-lg font-semibold tabular-nums">
          <time dateTime={date}>{label}</time>
        </h2>
      ) : (
        <span className="px-2 py-2 text-center text-lg font-semibold tabular-nums">
          <time dateTime={date}>{label}</time>
        </span>
      )}
      {page.nextDay === null ? (
        <span />
      ) : (
        <Button
          nativeButton={false}
          render={<Link to={matchListDayPath(locale, page.nextDay)} prefetch="intent" />}
          variant="outline"
          size="touch"
          className="min-w-12 gap-1 justify-self-end px-3"
        >
          <span className="max-[370px]:sr-only">{t(keys.match.sparring.nextDay)}</span>
          <DayArrow forward />
        </Button>
      )}
    </nav>
  )
}

function DayArrow({ forward = false }: { forward?: boolean }) {
  return (
    <svg
      aria-hidden
      className={cn('size-5 shrink-0', forward && 'rotate-180')}
      viewBox="0 0 20 20"
      fill="none"
    >
      <path d="m12 5-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MatchListViewToggle({ view, locale }: { view: MatchListView; locale: 'uk' | 'en' }) {
  const { t } = useTranslation()

  return (
    <SegmentedNavigation aria-label={t(keys.match.sparring.views)}>
      <SegmentedNavigationLink
        active={view === 'live'}
        render={<Link to={localizedPath('/sparring/matches/', locale)} prefetch="intent" />}
        className="gap-2"
      >
        <LiveDot />
        {t(keys.match.sparring.liveMatches)}
      </SegmentedNavigationLink>
      <SegmentedNavigationLink
        active={view === 'finished'}
        render={<Link to={localizedPath('/sparring/matches/finished/', locale)} prefetch="intent" />}
      >
        {t(keys.match.sparring.finishedMatches)}
      </SegmentedNavigationLink>
    </SegmentedNavigation>
  )
}

function MatchGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{children}</div>
}

function MatchRow({ match, locale }: { match: MatchListEntry; locale: 'uk' | 'en' }) {
  const { t } = useTranslation()
  const score = displayedScore(match)
  const winner = match.score.winnerSeat
  const showPlayerTargets = match.hasCustomFrameTarget

  const activeFrame = match.gameKey === 'free-pyramid-long' ? null : match.score.activeFrame

  const activeFrameScore =
    match.status === 'active' && match.score.matchTargetFrames > 1 ? activeFrame?.pointsBySeat : undefined

  return (
    <Link
      to={matchUrl(match.gameKey, match.matchId, locale)}
      className="block rounded-xl border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1">
        <PlayerName
          name={match.participants.A.displayName}
          target={showPlayerTargets ? match.score.frameTargetPointsBySeat.A : undefined}
          emphasized={winner === null || winner === 'A'}
          strong={match.status === 'finished'}
        />
        <PlayerScore
          value={score.A}
          activeFrameValue={activeFrameScore?.A}
          emphasized={winner === null || winner === 'A'}
        />
        <PlayerName
          name={match.participants.B.displayName}
          target={showPlayerTargets ? match.score.frameTargetPointsBySeat.B : undefined}
          emphasized={winner === null || winner === 'B'}
          strong={match.status === 'finished'}
        />
        <PlayerScore
          value={score.B}
          activeFrameValue={activeFrameScore?.B}
          emphasized={winner === null || winner === 'B'}
        />
      </div>

      <div className="mt-3 flex items-start gap-2 border-t border-border pt-3 leading-6 text-muted-foreground">
        {match.status === 'active' ? <LiveDot className="mt-2" /> : null}
        <span className="min-w-0">
          <span className="sr-only">
            {t(match.status === 'active' ? keys.status.live : keys.status.finished)}
          </span>
          <span>{match.shortGameTitle}</span>
          {(match.status === 'active' && !showPlayerTargets) ||
          (match.hasCustomFrameTarget && match.score.matchTargetFrames > 1) ? (
            <>
              {' · '}
              <span>
                {t(keys.match.scoreboard.target, {
                  target: displayedTarget(match.score),
                })}
              </span>
            </>
          ) : null}
          {match.status === 'active' && activeFrame !== null ? (
            <>
              {' · '}
              <span>
                {t(keys.match.scoreboard.frameWithNumber, {
                  frameIndex: activeFrame.frameIndex,
                })}
              </span>
            </>
          ) : null}
          {' · '}
          <time dateTime={match.createdAtIso} className="tabular-nums">
            {match.createdAtLabel}
          </time>
        </span>
      </div>
    </Link>
  )
}

function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full bg-primary', className)}
      aria-hidden="true"
    />
  )
}

function PlayerName({
  name,
  target,
  emphasized,
  strong,
}: {
  name: string
  target?: number
  emphasized: boolean
  strong: boolean
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-baseline gap-1 text-[18px] leading-snug',
        emphasized
          ? cn(strong ? 'font-semibold' : 'font-normal', 'text-[var(--bone)]')
          : 'text-muted-foreground',
      )}
    >
      <span className="truncate">{name}</span>
      {target === undefined ? null : (
        <span className="shrink-0 text-sm font-normal text-muted-foreground tabular-nums">/{target}</span>
      )}
    </span>
  )
}

function PlayerScore({
  value,
  activeFrameValue,
  emphasized,
}: {
  value: number
  activeFrameValue?: number
  emphasized: boolean
}) {
  return (
    <span className="flex items-baseline justify-end gap-3 tabular-nums">
      {activeFrameValue === undefined ? null : (
        <span className="text-[18px] leading-none font-normal text-amber">{activeFrameValue}</span>
      )}
      <span
        className={cn(
          'text-right text-[22px] leading-none font-semibold',
          emphasized ? 'text-[var(--bone)]' : 'text-muted-foreground',
        )}
      >
        {value}
      </span>
    </span>
  )
}

type ScoreSnapshot = Pick<MatchListEntry, 'status' | 'latestSeq' | 'score'>

type ScoreOverrides = ReadonlyMap<MatchId, MatchScorePollEntry>

type ScoreOverridesAction = { readonly entries: readonly MatchScorePollEntry[] }

function scoreOverridesReducer(state: ScoreOverrides, action: ScoreOverridesAction): ScoreOverrides {
  let next: Map<MatchId, MatchScorePollEntry> | undefined

  for (const entry of action.entries) {
    const current = state.get(entry.matchId)

    if (current !== undefined && !shouldReplaceScore(current, entry)) continue
    next ??= new Map(state)
    next.set(entry.matchId, entry)
  }

  return next ?? state
}

function mergeMatchEntry(match: MatchListEntry, override?: MatchScorePollEntry): MatchListEntry {
  if (override === undefined || !shouldReplaceScore(match, override)) return match

  return override.status === 'active'
    ? {
        ...match,
        status: override.status,
        endedAt: override.endedAt,
        latestSeq: override.latestSeq,
        score: override.score,
      }
    : {
        ...match,
        status: override.status,
        endedAt: override.endedAt,
        latestSeq: override.latestSeq,
        score: override.score,
      }
}

function shouldReplaceScore(current: ScoreSnapshot, incoming: ScoreSnapshot): boolean {
  if (current.status === 'finished' && incoming.status === 'active') return false

  if (incoming.latestSeq > current.latestSeq) return true

  if (incoming.latestSeq < current.latestSeq) return false

  return current.status === 'active' && incoming.status === 'finished'
}

function useLiveMatchList(
  activeMatches: readonly MatchListEntry[],
  dispatch: React.Dispatch<ScoreOverridesAction>,
  revalidate: () => Promise<void>,
) {
  const current = useRef({ activeMatches, dispatch, revalidate })
  useLayoutEffect(() => {
    current.current = { activeMatches, dispatch, revalidate }
  }, [activeMatches, dispatch, revalidate])
  const controller = useRef<LiveListController>(null)

  useEffect(() => {
    const scheduler = new LiveListController({
      hasScores: () => current.current.activeMatches.length > 0,
      readFullList: async () => current.current.revalidate(),
      readScores: async (signal) => {
        const requestedMatches = current.current.activeMatches
        const search = new URLSearchParams()

        for (const match of requestedMatches) search.append('matchId', match.matchId)

        const response = await fetch(`/api/sparring-matches/live-scores/?${search}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal,
        })

        if (response.status === 404) {
          // A discarded match no longer exists; only the loader can replace list membership.
          if (!signal.aborted) controller.current?.demandFullRead()

          return
        }

        if (!response.ok) throw new Error('Match score polling failed')
        const result = v.safeParse(MatchScorePollResponse, await response.json())

        if (!result.success || result.output.matches.length !== requestedMatches.length)
          throw new Error('Invalid Match score polling response')

        for (const [index, entry] of result.output.matches.entries())
          if (entry.matchId !== requestedMatches[index]?.matchId)
            throw new Error('Mismatched Match score polling response')

        if (signal.aborted) return

        const entries = result.output.matches.filter((entry, index) =>
          shouldReplaceScore(requestedMatches[index], entry),
        )

        if (entries.length > 0) current.current.dispatch({ entries })

        if (entries.some((entry) => entry.status === 'finished')) controller.current?.demandFullRead()
      },
    })

    controller.current = scheduler
    scheduler.start()

    return () => {
      scheduler.dispose()
      controller.current = null
    }
  }, [])

  useEffect(() => {
    // Loader completion can precede React's commit. Reconsider score polling once newly discovered
    // Active Matches land.
    controller.current?.snapshot()
  }, [activeMatches])
}

function displayedScore(match: MatchListEntry): BySeatNumber {
  if (match.score.matchTargetFrames > 1) return match.score.framesWonBySeat

  return match.score.singleFramePointsBySeat ?? match.score.framesWonBySeat
}

function displayedTarget(score: MatchScoreProjection): number | string {
  if (score.matchTargetFrames > 1) return score.matchTargetFrames

  const { A, B } = score.frameTargetPointsBySeat

  return A === B ? A : `${A}/${B}`
}

function matchListDayPath(locale: 'uk' | 'en', day: string): string {
  return localizedPath(`/sparring/matches/finished/${day}/`, locale)
}

function localDateLabel(date: string): string {
  const [year, month, day] = date.split('-')

  return `${day}.${month}.${year}`
}
