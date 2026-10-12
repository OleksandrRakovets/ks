import { redirect } from 'react-router'

import { localeFromContext, localizedPath } from '@/i18n'

import type { Route } from './+types/now'

/** Short owner-typed address for the live Match list; not linked from the UI. */
export function loader({ context }: Route.LoaderArgs) {
  return redirect(localizedPath('/sparring/matches/', localeFromContext(context)))
}
