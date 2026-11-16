import { isRouteErrorResponse, useRouteError } from 'react-router'

import {
  ScoreboardPage,
  type ScoreboardReadFailed,
  type ScoreboardSource,
} from '@/features/scoreboard/page/scoreboard-page'
import { loadMatchScoreboard } from '@/routes/sparring/match/handlers'

import type { Route } from './+types/scoreboard'

export function loader(args: Route.LoaderArgs): Promise<ScoreboardSource> {
  return loadMatchScoreboard(args)
}

/**
 * Background reads never replace the stream with an error page. Once the page has rendered, its
 * URL cannot change, so every failed read is transient: it resolves to a marker and the page keeps
 * its last good state.
 */
export async function clientLoader({
  serverLoader,
}: Route.ClientLoaderArgs): Promise<ScoreboardSource | ScoreboardReadFailed> {
  try {
    return await serverLoader()
  } catch {
    return { readFailed: true }
  }
}

export default function ScoreboardRoute({ loaderData }: Route.ComponentProps) {
  return <ScoreboardPage initial={'readFailed' in loaderData ? null : loaderData} recover />
}

/**
 * A failed document load (OBS start or scene activation during a storage hiccup) stays transparent
 * and recovers through the same route read. A malformed URL (400/404) is final.
 */
export function ErrorBoundary() {
  const error = useRouteError()

  return <ScoreboardPage initial={null} recover={!(isRouteErrorResponse(error) && error.status < 500)} />
}
