import {
  type MatchListEntry,
  type MatchListPage as MatchListPageData,
  type MatchScorePollEntry,
  MatchScorePollResponse,
} from '@ks/application'
import type { BySeatNumber, MatchId, MatchScoreProjection, Seat, UnixEpochMilliseconds } from '@ks/core'
import { keys } from '@ks/i18n'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useRevalidator } from 'react-router'
import * as v from 'valibot'

import { Page } from '@/components/Page'
import { Button, ToggleGroup, ToggleGroupItem } from '@/components/ui'
import { cn } from '@/components/ui/utils'

import { localizedPath } from '../../locale'
import { useRootLocale } from '../../root'
import { matchUrlForStatus } from '../match-urls'

export type MatchListView = 'live' | 'completed'

export type MatchListUpdates =
  | {
      readonly kind: 'poll-scores'
      readonly matchIds: readonly MatchId[]
      readonly revalidateAt?: UnixEpochMilliseconds
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
  const revalidator = useRevalidator()
  const revalidate = useCallback(() => void revalidator.revalidate(), [revalidator])

  const matches = useMemo(
    () => data.page.matches.map((match) => mergeMatchEntry(match, overrides.get(match.matchId))),
    [data.page.matches, overrides],
  )

  const pollableIds = useMemo(() => new Set(updates.matchIds), [updates.matchIds])

  const activeMatches = useMemo(
    () => matches.filter((match) => match.status === 'active' && pollableIds.has(match.matchId)),
    [matches, pollableIds],
  )

  useMatchScorePolling(activeMatches, dispatch, revalidate)
  useMatchListExpiry(updates.revalidateAt, revalidate)

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
  const [isClient, setIsClient] = useState(false)

  // The browser timezone is unavailable during SSR; reveal local start times after hydration.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => setIsClient(true), [])

  return (
    <Page title={t(keys.nav.matches)} headerAction={<MatchListViewToggle view={view} locale={locale} />}>
      {matches.length === 0 ? (
        <p className="text-muted-foreground">
          {t(view === 'live' ? keys.match.sparring.noLiveMatches : keys.match.sparring.noCompletedMatches)}
        </p>
      ) : (
        <MatchGrid>
          {matches.map((match) => (
            <MatchRow key={match.matchId} match={match} locale={locale} isClient={isClient} />
          ))}
        </MatchGrid>
      )}

      {page.page > 1 || page.hasNextPage ? (
        <nav
          aria-label={t(keys.match.sparring.pagination)}
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"
        >
          {page.page > 1 ? (
            <Button
              nativeButton={false}
              render={<Link to={matchListPagePath(locale, view, page.page - 1)} prefetch="intent" />}
              variant="outline"
              size="touch"
              className="justify-self-start"
            >
              {t(keys.match.sparring.previousPage)}
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground tabular-nums">
            {t(keys.match.sparring.pageNumber, { page: page.page })}
          </span>
          {page.hasNextPage ? (
            <Button
              nativeButton={false}
              render={<Link to={matchListPagePath(locale, view, page.page + 1)} prefetch="intent" />}
              variant="outline"
              size="touch"
              className="justify-self-end"
            >
              {t(keys.match.sparring.nextPage)}
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </Page>
  )
}

function MatchListViewToggle({ view, locale }: { view: MatchListView; locale: 'uk' | 'en' }) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t(keys.match.sparring.views)}>
      <ToggleGroup value={[view]}>
        <ToggleGroupItem
          value="live"
          nativeButton={false}
          render={<Link to={localizedPath('/sparring/matches/', locale)} prefetch="intent" />}
          className="gap-2"
        >
          <LiveDot />
          {t(keys.match.sparring.liveMatches)}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="completed"
          nativeButton={false}
          render={<Link to={localizedPath('/sparring/matches/completed/', locale)} prefetch="intent" />}
        >
          {t(keys.match.sparring.completedMatches)}
        </ToggleGroupItem>
      </ToggleGroup>
    </nav>
  )
}

function MatchGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{children}</div>
}

function MatchRow({
  match,
  locale,
  isClient,
}: {
  match: MatchListEntry
  locale: 'uk' | 'en'
  isClient: boolean
}) {
  const { t } = useTranslation()
  const score = displayedScore(match)
  const winner = match.status === 'finished' ? leadingSeat(score) : undefined

  const startLabel = isClient ? formatMatchStart(match.createdAt, locale) : undefined
  const activeFrame = match.gameKey === 'free-pyramid-long' ? null : match.score.activeFrame

  return (
    <Link
      to={matchUrlForStatus(match.gameKey, match.matchId, match.status, locale)}
      className="block rounded-xl border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1">
        <PlayerName
          name={match.participants.A.displayName}
          emphasized={winner === undefined || winner === 'A'}
          strong={match.status === 'finished'}
        />
        <PlayerScore value={score.A} emphasized={winner === undefined || winner === 'A'} />
        <PlayerName
          name={match.participants.B.displayName}
          emphasized={winner === undefined || winner === 'B'}
          strong={match.status === 'finished'}
        />
        <PlayerScore value={score.B} emphasized={winner === undefined || winner === 'B'} />
      </div>

      <div className="mt-3 flex items-start gap-2 border-t border-border pt-3 leading-6 text-muted-foreground">
        {match.status === 'active' ? <LiveDot className="mt-2" /> : null}
        <span className="min-w-0">
          <span className="sr-only">
            {t(match.status === 'active' ? keys.status.live : keys.status.finished)}
          </span>
          <span>{match.shortGameTitle}</span>
          {match.status === 'active' ? (
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
          {startLabel !== undefined ? (
            <>
              {' · '}
              <time dateTime={new Date(match.createdAt).toISOString()} className="tabular-nums">
                {startLabel}
              </time>
            </>
          ) : null}
        </span>
      </div>
    </Link>
  )
}

function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('inline-block size-2 shrink-0 rounded-full bg-green', className)} aria-hidden="true" />
  )
}

function PlayerName({ name, emphasized, strong }: { name: string; emphasized: boolean; strong: boolean }) {
  return (
    <span
      className={cn(
        'truncate text-[18px] leading-snug',
        emphasized
          ? cn(strong ? 'font-semibold' : 'font-normal', 'text-[var(--bone)]')
          : 'text-muted-foreground',
      )}
    >
      {name}
    </span>
  )
}

function PlayerScore({ value, emphasized }: { value: number; emphasized: boolean }) {
  return (
    <span
      className={cn(
        'text-right text-[22px] leading-none font-semibold tabular-nums',
        emphasized ? 'text-[var(--bone)]' : 'text-[var(--t-muted)]',
      )}
    >
      {value}
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

function useMatchScorePolling(
  activeMatches: readonly MatchListEntry[],
  dispatch: React.Dispatch<ScoreOverridesAction>,
  onMatchFinished: () => void,
) {
  useEffect(() => {
    if (activeMatches.length === 0) return undefined
    let disposed = false
    let timer: number | undefined
    let requestController: AbortController | undefined

    function clearTimer() {
      if (timer === undefined) return
      window.clearTimeout(timer)
      timer = undefined
    }

    function scheduleNextPoll() {
      if (disposed || document.visibilityState === 'hidden') return
      clearTimer()
      const jitter = 0.9 + Math.random() * 0.2
      timer = window.setTimeout(() => void poll(), 30_000 * jitter)
    }

    async function poll() {
      if (disposed || requestController !== undefined || document.visibilityState === 'hidden') return
      clearTimer()
      const requestedMatches = activeMatches
      const controller = new AbortController()
      requestController = controller

      try {
        const search = new URLSearchParams()

        for (const match of requestedMatches) search.append('matchId', match.matchId)

        const response = await fetch(`/api/sparring-matches/scores/?${search}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })

        if (!response.ok) throw new Error('Match score polling failed')
        const result = v.safeParse(MatchScorePollResponse, await response.json())

        if (!result.success || result.output.matches.length !== requestedMatches.length)
          throw new Error('Invalid Match score polling response')

        for (const [index, entry] of result.output.matches.entries()) {
          if (entry.matchId !== requestedMatches[index]?.matchId)
            throw new Error('Mismatched Match score polling response')
        }

        if (controller.signal.aborted) return

        const changedEntries = result.output.matches.filter((entry, index) => {
          const current = requestedMatches[index]

          return shouldReplaceScore(current, entry)
        })

        if (changedEntries.length > 0) {
          dispatch({ entries: changedEntries })

          if (changedEntries.some((entry) => entry.status === 'finished')) onMatchFinished()
        }
      } catch {
        // Retain the last successful projections and retry on the next scheduled or browser-triggered poll.
      } finally {
        requestController = undefined
        scheduleNextPoll()
      }
    }

    function catchUp() {
      if (document.visibilityState !== 'visible') {
        clearTimer()

        return
      }

      if (requestController !== undefined) return
      clearTimer()
      void poll()
    }

    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('focus', catchUp)
    scheduleNextPoll()

    return () => {
      disposed = true
      clearTimer()
      requestController?.abort()
      document.removeEventListener('visibilitychange', catchUp)
      window.removeEventListener('focus', catchUp)
    }
  }, [activeMatches, dispatch, onMatchFinished])
}

function useMatchListExpiry(revalidateAt: UnixEpochMilliseconds | undefined, revalidate: () => void) {
  useEffect(() => {
    if (revalidateAt === undefined) return undefined

    const timer = window.setTimeout(revalidate, Math.max(0, revalidateAt - Date.now() + 100))

    return () => window.clearTimeout(timer)
  }, [revalidate, revalidateAt])
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

function leadingSeat(score: BySeatNumber): Seat | undefined {
  if (score.A > score.B) return 'A'

  if (score.B > score.A) return 'B'

  return undefined
}

function formatMatchStart(createdAt: UnixEpochMilliseconds, locale: 'uk' | 'en'): string {
  const started = new Date(createdAt)
  const today = new Date()

  if (
    started.getFullYear() === today.getFullYear() &&
    started.getMonth() === today.getMonth() &&
    started.getDate() === today.getDate()
  ) {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(started)
  }

  const date = `${twoDigits(started.getDate())}.${twoDigits(started.getMonth() + 1)}`

  return started.getFullYear() === today.getFullYear() ? date : `${date}.${started.getFullYear()}`
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function matchListPagePath(locale: 'uk' | 'en', view: MatchListView, page: number): string {
  const path = localizedPath(view === 'live' ? '/sparring/matches/' : '/sparring/matches/completed/', locale)

  return page === 1 ? path : `${path}?${new URLSearchParams({ page: String(page) })}`
}
