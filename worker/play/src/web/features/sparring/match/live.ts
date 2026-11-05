import type { MatchReadFacts } from '@ks/application'
import type { MatchCommand, MatchId } from '@ks/core'
import { keys } from '@ks/i18n'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useRevalidator } from 'react-router'

import { MatchLiveController } from '@/features/sparring/match/live-controller'
import type { ControlActionData } from '@/features/sparring/match/types'

export function matchCommandForm(command: MatchCommand) {
  return { command: JSON.stringify(command) }
}

/**
 * Wires Control-page loader facts and the local submission lifecycle into one live controller.
 * The returned callback must run before submitting a Command or discard, closing the small interval
 * before React exposes fetcher.state. Accepted Commands still use Router's normal post-action loader read.
 */
export function useControlLiveRevalidation(
  facts: Pick<MatchReadFacts, 'matchId' | 'lifecycle' | 'latestSeq'>,
  fetcher: { state: string; data?: ControlActionData },
  discarding: boolean,
): () => void {
  // Discard is also a local submission: its terminal socket close must not read the page into a 404
  // before the redirect arrives.
  const controller = useMatchLiveController(facts, 'control', fetcher.state !== 'idle' || discarding)

  useEffect(() => {
    if (fetcher.data?.ok === false && fetcher.data.errorKey === keys.match.control.correctionUnavailable) {
      controller.current?.forceRead()
    }
  }, [fetcher.data, controller])

  return () => controller.current?.setSubmitting(true)
}

/** Wires active Protocol pages to the same match freshness rules, without a submission gate. */
export function useProtocolLiveRevalidation(
  facts: Pick<MatchReadFacts, 'matchId' | 'lifecycle' | 'latestSeq'>,
): void {
  useMatchLiveController(facts, 'protocol', false)
}

/**
 * Wires the read-only scoreboard to the same freshness rules. Its `read` must keep loader errors
 * out of Router boundaries: a failed read commits facts with `readFailed`, the page keeps showing
 * its last good state, and the controller retries at its watchdog deadline or on the next hint.
 * A missing (discarded) match has no live work. Uses the socket's read-only `protocol` view.
 */
export function useScoreboardLiveRevalidation(facts: LiveFacts, read: () => Promise<void>): void {
  useMatchLiveController(facts, 'protocol', false, read)
}

type LiveFacts = {
  readonly matchId: MatchId
  readonly lifecycle: MatchReadFacts['lifecycle'] | 'missing'
  readonly latestSeq: number
  readonly readFailed?: boolean
}

function useMatchLiveController(
  facts: LiveFacts,
  pageKind: 'control' | 'protocol',
  submitting: boolean,
  read?: () => Promise<void>,
) {
  const { matchId, lifecycle, latestSeq } = facts
  const { revalidate } = useRevalidator()
  const current = useRef({ read: read ?? revalidate, facts, submitting })
  const committedReads = useRef(new Set<() => void>())

  useLayoutEffect(() => {
    current.current = { read: read ?? revalidate, facts, submitting }
  }, [read, revalidate, facts, submitting])

  useLayoutEffect(() => {
    // Router's revalidate promise means its state was updated, not that React has committed the
    // projection. Each new loader result has a new facts object, including equal-cursor reads.
    // Complete GETs only after that commit, otherwise the controller still sees the old cursor
    // and immediately requests a redundant GET. This also works when commit precedes the promise.
    for (const complete of committedReads.current) complete()
    committedReads.current.clear()
  }, [facts])
  const controller = useRef<MatchLiveController>(null)

  useLayoutEffect(() => {
    // The controller owns imperative listeners/timers, so its lifetime follows the DOM commit.
    // Passive cleanup can lag behind a visible Result projection; a foreground event or timer
    // in that gap would still reach the active controller and start an unnecessary loader GET.
    if (lifecycle !== 'active') return undefined
    const completions = committedReads.current
    let disposed = false

    const live = new MatchLiveController(matchId, pageKind, current.current.facts.latestSeq, async () => {
      const previousFacts = current.current.facts
      await current.current.read()

      if (disposed) return

      if (current.current.facts === previousFacts) {
        await new Promise<void>((resolve) => {
          completions.add(resolve)
        })
      }

      if (current.current.facts.readFailed === true) throw new Error('Match read failed')

      live.snapshot(current.current.facts.latestSeq)
    })

    controller.current = live
    live.setSubmitting(current.current.submitting)
    live.start()

    return () => {
      disposed = true
      live.dispose()
      controller.current = null

      // A loader error or Result transition unmounts this active owner. Release commit waiters;
      // disposed-controller guards make their late completions inert, without retaining closures.
      for (const complete of completions) complete()
      completions.clear()
    }
  }, [matchId, lifecycle, pageKind])

  useEffect(() => {
    controller.current?.snapshot(latestSeq)
    controller.current?.setSubmitting(submitting)
  }, [latestSeq, submitting])

  return controller
}
