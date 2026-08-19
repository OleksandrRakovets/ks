const prefix = 'ks_match_control_'

export function matchControlCookieName(matchId: string): string {
  return `${prefix}${matchId}`
}

export function matchControlCookie(matchId: string, secret: string): string {
  return `${matchControlCookieName(matchId)}=${encodeURIComponent(secret)}; Path=/sparring/matches/${matchId}/; HttpOnly; SameSite=Lax`
}

export function matchControlSecretFromCookie(cookie: string | null, matchId: string): string | null {
  if (!cookie) return null
  const key = `${matchControlCookieName(matchId)}=`
  const part = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(key))
  return part ? decodeURIComponent(part.slice(key.length)) : null
}
