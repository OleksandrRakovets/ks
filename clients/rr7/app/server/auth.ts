import type { AppEnv } from './context'

export function requireBasicAuth(request: Request, env: AppEnv): boolean {
  const header = request.headers.get('authorization')
  if (!header) return false

  const [scheme, encoded] = header.split(' ', 2)
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return false

  let decoded = ''
  try {
    decoded = atob(encoded)
  } catch {
    return false
  }

  const separator = decoded.indexOf(':')
  if (separator < 0) return false

  const user = decoded.slice(0, separator)
  const pass = decoded.slice(separator + 1)
  return user === env.ADMIN_USER && pass === env.ADMIN_PASS
}
