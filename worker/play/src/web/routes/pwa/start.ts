import { redirect } from 'react-router'

import { navigationFromCookie } from '@/features/pwa/navigation'

export function loader({ request }: { request: Request }) {
  return redirect(navigationFromCookie(request.headers.get('cookie'), new URL(request.url).origin), {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  })
}
