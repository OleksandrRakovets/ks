import { redirect, type RouterContextProvider } from 'react-router'

import { localeContext } from '@/i18n'

/** Route middleware for every localized page tree: `/en/…` is English, anything else Ukrainian. */
export function setLocaleFromUrl({
  request,
  context,
}: {
  request: Request
  context: Pick<RouterContextProvider, 'set'>
}) {
  const url = new URL(request.url)

  if (url.pathname === '/en') {
    throw redirect(`/en/${url.search}`, 308)
  }

  context.set(localeContext, url.pathname.startsWith('/en/') ? 'en' : 'uk')
}
