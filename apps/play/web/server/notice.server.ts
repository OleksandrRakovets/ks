import * as v from 'valibot'

const COOKIE_NAME = 'ks.notice'

const Notice = v.picklist(['match-discarded'])

export type Notice = v.InferOutput<typeof Notice>

/**
 * Carries a one-off notice across a redirect. The value only selects known copy; it is not authority,
 * so it needs no signing. Replace the internals with session flash once the app has sessions.
 */
export function noticeCookie(notice: Notice): string {
  return `${COOKIE_NAME}=${notice}; Path=/; SameSite=Lax; HttpOnly; Max-Age=60`
}

/** Reads a pending notice and clears the cookie, including unrecognized values. */
export function consumeNotice(request: Request) {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1)

  if (value === undefined) return { notice: null, headers: new Headers() }

  const notice = v.safeParse(Notice, value)

  return {
    notice: notice.success ? notice.output : null,
    headers: new Headers({ 'Set-Cookie': `${COOKIE_NAME}=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0` }),
  }
}
