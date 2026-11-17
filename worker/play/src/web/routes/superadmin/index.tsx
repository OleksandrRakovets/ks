import { Page } from '@/components/page'
import { superadminContext } from '@/server/context.server'

import type { Route } from './+types/index'

/** 404s a request the Worker did not verify, such as a path variant its gate missed. */
export function loader({ context }: Route.LoaderArgs) {
  if (!context.get(superadminContext)) throw new Response('Not Found', { status: 404 })

  return null
}

/** Superadmin is outside localization for now, so its copy is Ukrainian JSX rather than i18n keys. */
export default function SuperadminHome() {
  return <Page title="Суперадмін">{null}</Page>
}
