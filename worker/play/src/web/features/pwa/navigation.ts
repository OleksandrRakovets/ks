import * as v from 'valibot'

const COOKIE_NAME = 'ks.lastUrl'

// oxlint-disable-next-line no-control-regex -- URL parsing can strip controls and turn a relative path into an external destination.
const NavigationUrl = v.pipe(v.string(), v.regex(/^\/(?!\/)[^\u0000-\u0020\u007f\\]*$/u))

/** Navigation is browser-local convenience, not authority or an authorization capability. */
export function navigationCookieValue(url: URL): string | null {
  if (isLaunchPath(url.pathname)) return null

  const destination = `${url.pathname}${url.search}${url.hash}`

  return `${COOKIE_NAME}=${encodeURIComponent(destination)}; Path=/; SameSite=Lax; Max-Age=604800${url.protocol === 'https:' ? '; Secure' : ''}`
}

export function navigationFromCookie(cookieHeader: string | null, origin: string): string {
  const cookie = cookieHeader?.split(';').find((part) => part.trim().startsWith(`${COOKIE_NAME}=`))

  if (cookie === undefined) return '/'

  try {
    const value = v.safeParse(NavigationUrl, decodeURIComponent(cookie.trim().slice(COOKIE_NAME.length + 1)))

    if (!value.success) return '/'

    const url = new URL(value.output, origin)

    if (url.origin !== origin || url.pathname.startsWith('//') || isLaunchPath(url.pathname)) return '/'

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

function isLaunchPath(pathname: string): boolean {
  return decodeURIComponent(pathname).replace(/\/+$/u, '').toLowerCase() === '/start'
}
