import {
  type MatchListEntry,
  type MatchListPage,
  MatchListPagination,
  type MatchScorePollEntry,
  MatchScorePollResponse,
} from '@ks/application'
import type { BySeatNumber, MatchId, Seat, UnixEpochMilliseconds } from '@ks/core'
import { keys } from '@ks/i18n'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLoaderData } from 'react-router'
import * as v from 'valibot'

import { Page } from '@/components/Page'
import { Button } from '@/components/ui'
import { cn } from '@/components/ui/utils'

import { matchUrlForStatus } from '../features/match-urls'
import { localeFromContext, localizedPath } from '../locale'
import { useRootLocale } from '../root'
import type { AppLoadContext } from '../server/context'
import { requireApplication } from '../server/context'

type LoaderData = MatchListPage

export async function loader({
  request,
  context,
}: {
  request: Request
  context: AppLoadContext
}): Promise<LoaderData> {
  const application = requireApplication(context)
  const locale = localeFromContext(context)
  const url = new URL(request.url)

  if (url.searchParams.getAll('page').length > 1 || url.searchParams.getAll('pageSize').length > 1)
    throw new Response('Invalid Match list pagination', { status: 400 })

  const pagination = v.safeParse(MatchListPagination, {
    page: parsePositiveInteger(url.searchParams.get('page')),
    pageSize: parsePositiveInteger(url.searchParams.get('pageSize')),
  })

  if (!pagination.success) throw new Response('Invalid Match list pagination', { status: 400 })

  return application.listMatches(locale, pagination.output)
}

export default function SparringMatchesRoute() {
  const { t } = useTranslation()
  const locale = useRootLocale()
  const page = useLoaderData<typeof loader>()
  const [overrides, dispatch] = useReducer(scoreOverridesReducer, new Map())
  const [isClient, setIsClient] = useState(false)

  const matches = useMemo(
    () => page.matches.map((match) => mergeMatchEntry(match, overrides.get(match.matchId))),
    [overrides, page.matches],
  )

  const activeMatches = useMemo(() => matches.filter((match) => match.status === 'active'), [matches])

  const finishedMatches = useMemo(() => matches.filter((match) => match.status === 'finished'), [matches])

  // The browser timezone is unavailable during SSR; reveal local start times after hydration.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => setIsClient(true), [])
  useMatchScorePolling(activeMatches, dispatch)

  return (
    <Page title={t(keys.nav.matches)}>
      {matches.length === 0 ? (
        <p className="text-muted-foreground">{t(keys.match.sparring.noRecentMatches)}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {activeMatches.length > 0 ? (
            <MatchSection title={t(keys.match.sparring.playingNow)}>
              {activeMatches.map((match) => (
                <MatchRow key={match.matchId} match={match} locale={locale} isClient={isClient} />
              ))}
            </MatchSection>
          ) : null}

          {finishedMatches.length > 0 ? (
            <MatchSection title={t(keys.match.sparring.finishedMatches)}>
              {finishedMatches.map((match) => (
                <MatchRow key={match.matchId} match={match} locale={locale} isClient={isClient} />
              ))}
            </MatchSection>
          ) : null}
        </div>
      )}

      {page.page > 1 || page.hasNextPage ? (
        <nav
          aria-label={t(keys.match.sparring.pagination)}
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"
        >
          {page.page > 1 ? (
            <Button
              nativeButton={false}
              render={<Link to={matchListPagePath(locale, page.page - 1, page.pageSize)} prefetch="intent" />}
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
              render={<Link to={matchListPagePath(locale, page.page + 1, page.pageSize)} prefetch="intent" />}
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

type MatchSectionProps = {
  title: string
  children: React.ReactNode
}

function MatchSection({ title, children }: MatchSectionProps) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[17px] font-semibold text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{children}</div>
    </section>
  )
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

  return (
    <Link
      to={matchUrlForStatus(match.gameKey, match.matchId, match.status, locale)}
      className={cn(
        'block rounded-xl border bg-card px-4 py-3.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
        match.status === 'active' ? 'border-green hover:bg-muted' : 'border-border hover:bg-muted',
      )}
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

      <div
        className={cn(
          'mt-3 text-muted-foreground',
          match.status === 'finished' && 'border-t border-border pt-3',
        )}
      >
        {match.status === 'active' ? (
          <>
            <span className="mr-2 inline-block size-2 rounded-full bg-green" aria-hidden="true" />
            <span className="sr-only">{t(keys.status.live)}</span>
          </>
        ) : (
          <span className="sr-only">{t(keys.status.finished)}</span>
        )}
        <span>{match.shortGameTitle}</span>
        {match.status === 'active' && match.score.matchTargetFrames > 1 ? (
          <>
            {' · '}
            <span>
              {t(keys.match.scoreboard.raceToWins, {
                targetFrames: match.score.matchTargetFrames,
              })}
            </span>
          </>
        ) : null}
        {match.status === 'active' && match.score.activeFrame !== null ? (
          <>
            {' · '}
            <span>
              {t(keys.match.scoreboard.frameWithNumber, {
                frameIndex: match.score.activeFrame.frameIndex,
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
      </div>
    </Link>
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

  return { ...match, status: override.status, latestSeq: override.latestSeq, score: override.score }
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

        if (changedEntries.length > 0) dispatch({ entries: changedEntries })
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
  }, [activeMatches, dispatch])
}

function displayedScore(match: MatchListEntry): BySeatNumber {
  if (match.score.matchTargetFrames > 1) return match.score.framesWonBySeat

  return match.score.singleFramePointsBySeat ?? match.score.framesWonBySeat
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

function matchListPagePath(locale: 'uk' | 'en', page: number, pageSize: number): string {
  const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })

  return `${localizedPath('/sparring/matches/', locale)}?${search}`
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (value === null) return undefined

  if (!/^[1-9]\d*$/.test(value)) throw new Response('Invalid Match list pagination', { status: 400 })
  const parsed = Number(value)

  if (!Number.isSafeInteger(parsed)) throw new Response('Invalid Match list pagination', { status: 400 })

  return parsed
}
