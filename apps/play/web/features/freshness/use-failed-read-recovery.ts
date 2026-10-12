import { useEffect } from 'react'
import { useRevalidator } from 'react-router'

import { useRouteErrorIsNotFound } from '@/components/route-error'

import { ReadRecovery } from './read-recovery'

/**
 * Retries failed GET loaders from an error boundary; it never replays a Command POST, and a genuine
 * 404 is final. A loader failure unmounts any live page controller, and single fetch assigns a
 * failed `.data` request to every route it loads, including root, so the root boundary is where an
 * unattended live page recovers from a network outage.
 */
export function useFailedReadRecovery(): void {
  const { revalidate } = useRevalidator()
  const recoverable = !useRouteErrorIsNotFound()

  useEffect(() => {
    if (!recoverable) return undefined
    const recovery = new ReadRecovery(revalidate)
    recovery.start()

    return () => recovery.dispose()
  }, [recoverable, revalidate])
}
