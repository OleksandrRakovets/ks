import type { Route } from './+types/favicon'

export function loader(_args: Route.LoaderArgs) {
  return new Response(null, { status: 204 })
}
