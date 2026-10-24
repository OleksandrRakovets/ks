import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { useLoaderData } from 'react-router'

import { Page } from '@/components/page'
import { superadminContext } from '@/server/context.server'

import type { Route } from './+types/index'

/** 404s a request the Worker did not verify, such as a path variant its gate missed. */
export function loader({ context }: Route.LoaderArgs) {
  const superadmin = context.get(superadminContext)

  if (superadmin === null) throw new Response('Not Found', { status: 404 })

  return { email: superadmin.email }
}

export default function SuperadminHome() {
  const { t } = useTranslation()
  const { email } = useLoaderData<typeof loader>()

  return (
    <Page title={t(keys.superadmin.title)}>
      <p className="text-sm text-muted-foreground">{t(keys.superadmin.signedInAs, { email })}</p>
    </Page>
  )
}
