import * as v from 'valibot'

/**
 * Superadmin pages and their Router data requests, matched on the decoded path case-insensitively
 * because React Router decodes and matches paths that way.
 */
const superadminPath = /^\/+superadmin(?![a-z\d])/i

/** Worker configuration for the superadmin gate; see `wrangler.jsonc`. */
export type SuperadminAccessEnv = {
  readonly SUPERADMIN_ACCESS_TEAM_DOMAIN: string
  readonly SUPERADMIN_ACCESS_AUD: string
}

export type SuperadminAccess =
  | { readonly _tag: 'public' }
  | { readonly _tag: 'granted' }
  | { readonly _tag: 'denied'; readonly response: Response }

/**
 * Gates superadmin requests on a valid Cloudflare Access token, independently of whether Access
 * itself is configured to intercept the path. Fails closed on missing configuration, tokens, or certs,
 * and on paths that cannot be decoded. Only code compiled by the Vite dev server skips the check.
 */
export async function checkSuperadminAccess(
  request: Request,
  env: SuperadminAccessEnv,
  now = Date.now(),
  fetchCerts: FetchCerts = fetch,
): Promise<SuperadminAccess> {
  let path: string

  try {
    path = decodeURI(new URL(request.url).pathname)
  } catch {
    return denied()
  }

  if (!superadminPath.test(path)) return { _tag: 'public' }

  // Builds compile this branch away; vite.config.ts fails a build that keeps this message.
  if (import.meta.env.KS_DEV_SERVER === true) {
    console.warn('Superadmin Access bypassed by the Vite dev server')

    return { _tag: 'granted' }
  }

  const config = v.safeParse(AccessConfig, {
    teamDomain: env.SUPERADMIN_ACCESS_TEAM_DOMAIN,
    audience: env.SUPERADMIN_ACCESS_AUD,
  })

  if (!config.success) {
    console.error('Superadmin Access is not configured; rejecting request')

    return denied()
  }

  const token = request.headers.get('Cf-Access-Jwt-Assertion')

  if (token === null) return denied()

  try {
    if (await verifyAccessToken(token, config.output, now, fetchCerts)) return { _tag: 'granted' }
  } catch (error) {
    console.error('Superadmin Access token verification failed', error)
  }

  return denied()
}

const AccessConfig = v.strictObject({
  teamDomain: v.pipe(v.string(), v.regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/)),
  audience: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
})

type AccessConfig = v.InferOutput<typeof AccessConfig>

type FetchCerts = (url: string) => Promise<Response>

const TokenHeader = v.object({ alg: v.literal('RS256'), kid: v.string() })

const TokenClaims = v.object({
  aud: v.union([v.string(), v.array(v.string())]),
  iss: v.string(),
  exp: v.number(),
  nbf: v.optional(v.number()),
  // Only people sign in to superadmin: Access service tokens carry no email and are denied by design.
  email: v.pipe(v.string(), v.nonEmpty()),
})

const Certs = v.object({
  keys: v.array(v.looseObject({ kid: v.string(), kty: v.literal('RSA'), n: v.string(), e: v.string() })),
})

type Certs = v.InferOutput<typeof Certs>

function denied(): SuperadminAccess {
  return {
    _tag: 'denied',
    response: new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } }),
  }
}

async function verifyAccessToken(
  token: string,
  config: AccessConfig,
  now: number,
  fetchCerts: FetchCerts,
): Promise<boolean> {
  const segments = /^([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(token)

  if (!segments) return false
  const [, encodedHeader, encodedClaims, encodedSignature] = segments
  const header = parseSegment(TokenHeader, encodedHeader)

  if (!header) return false
  const jwk = await signingKey(config.teamDomain, header.kid, now, fetchCerts)

  if (!jwk) return false

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`)

  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64Url(encodedSignature), signed)))
    return false

  const claims = parseSegment(TokenClaims, encodedClaims)

  if (!claims) return false
  const { aud, iss, exp, nbf } = claims
  const seconds = now / 1000

  if (iss !== config.teamDomain || exp <= seconds || (nbf !== undefined && nbf > seconds)) return false

  return (Array.isArray(aud) ? aud : [aud]).includes(config.audience)
}

/**
 * Per-isolate certs fetches, shared by concurrent requests. Keys expire after an hour so a key
 * Access removed stops being trusted. A token naming an unknown key refetches at most every five
 * minutes, so a key rotated sooner after a fetch is rejected until then; a failed fetch retries
 * after 30 seconds and rejects meanwhile.
 */
const certsByTeamDomain = new Map<string, CertsFetch>()

const certsMaxAge = 60 * 60 * 1000

const certsRefetchInterval = 5 * 60 * 1000

const certsRetryInterval = 30 * 1000

/** `certs` resolves to null when the fetch failed. */
type CertsFetch = { readonly startedAt: number; readonly certs: Promise<Certs | null> }

async function signingKey(
  teamDomain: string,
  kid: string,
  now: number,
  fetchCerts: FetchCerts,
): Promise<JsonWebKey | null> {
  let latest = certsByTeamDomain.get(teamDomain)

  if (latest === undefined || now - latest.startedAt >= certsMaxAge)
    latest = refreshCerts(teamDomain, latest, now, fetchCerts)
  let certs = await latest.certs
  const key = certs?.keys.find((candidate) => candidate.kid === kid)

  if (key) return key

  if (now - latest.startedAt >= (certs === null ? certsRetryInterval : certsRefetchInterval)) {
    latest = refreshCerts(teamDomain, latest, now, fetchCerts)
    certs = await latest.certs
  }

  if (certs === null) throw new Error('Access certs are unavailable')

  return certs.keys.find((candidate) => candidate.kid === kid) ?? null
}

/** Starts a fetch unless a concurrent request already replaced `stale`, whose fetch is then reused. */
function refreshCerts(
  teamDomain: string,
  stale: CertsFetch | undefined,
  now: number,
  fetchCerts: FetchCerts,
): CertsFetch {
  const current = certsByTeamDomain.get(teamDomain)

  if (current !== undefined && current !== stale) return current

  const certs = (async () => {
    try {
      const response = await fetchCerts(`${teamDomain}/cdn-cgi/access/certs`)

      if (!response.ok) throw new Error(`Access certs request failed with ${response.status}`)

      return v.parse(Certs, await response.json())
    } catch (error) {
      console.error('Superadmin Access certs fetch failed', error)

      return null
    }
  })()

  const started = { startedAt: now, certs }
  certsByTeamDomain.set(teamDomain, started)

  return started
}

function parseSegment<const Schema extends v.GenericSchema>(
  schema: Schema,
  segment: string,
): v.InferOutput<Schema> | null {
  try {
    const parsed = v.safeParse(schema, JSON.parse(new TextDecoder().decode(decodeBase64Url(segment))))

    return parsed.success ? parsed.output : null
  } catch {
    return null
  }
}

function decodeBase64Url(segment: string): Uint8Array<ArrayBuffer> {
  const base64 = segment.replaceAll('-', '+').replaceAll('_', '/')

  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (char) =>
    char.charCodeAt(0),
  )
}
