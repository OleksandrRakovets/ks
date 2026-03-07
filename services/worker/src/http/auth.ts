import type { Env } from '../env'

export function requireBasicAuth(req: Request, env: Env): boolean {
  const header = req.headers.get('authorization')
  if (!header) return false
  const [scheme, value] = header.split(' ', 2)
  if (scheme?.toLowerCase() !== 'basic' || !value) return false
  let decoded = ''
  try {
    decoded = atob(value)
  } catch {
    return false
  }
  const idx = decoded.indexOf(':')
  if (idx < 0) return false
  const user = decoded.slice(0, idx)
  const pass = decoded.slice(idx + 1)
  return user === env.ADMIN_USER && pass === env.ADMIN_PASS
}
