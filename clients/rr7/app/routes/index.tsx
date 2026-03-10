import { redirect } from 'react-router'

import type { LoaderFunctionArgs } from 'react-router'

export function loader(_args: LoaderFunctionArgs) {
  return redirect('/admin/create')
}

export default function IndexRedirect() {
  return null
}
