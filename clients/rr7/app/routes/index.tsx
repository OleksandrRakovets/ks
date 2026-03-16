import { redirect } from 'react-router'

import type { Route } from './+types/index'

export function loader(_args: Route.LoaderArgs) {
  return redirect('/admin/create')
}

export default function IndexRedirect() {
  return null
}
