import * as v from 'valibot'

import type { Superadmin } from '@/server/context.server'

/** Superadmin pages and their Router data requests, in either locale; matched case-insensitively like routes. */
const superadminPath = /^\/(?:en\/)?superadmin(?:[/.]|$)/i

/** Worker configuration for the superadmin gate; see `wrangler.jsonc` and `.dev.vars`. */
export type SuperadminAccessEnv = {
  readonly SUPERADMIN_ACCESS_TEAM_DOMAIN: string
  readonly SUPERADMIN_ACCESS_AUD: string
  /** Honored only by Vite dev builds; production bundles drop the branch at build time. */
  readonly SUPERADMIN_ACCESS_BYPASS?: string
}

export type SuperadminAccess =
  | { readonly _tag: 'public' }
  | { readonly _tag: 'granted'; readonly superadmin: Superadmin }
  | { readonly _tag: 'denied'; readonly response: Response }

/**
 * Gates superadmin requests on a valid Cloudflare Access token, independently of whether Access
 * itself is configured to intercept the path. Fails closed on missing configuration, tokens, or certs.
 */
export async function checkSuperadminAccess(
  request: Request,
  env: SuperadminAccessEnv,
  now = Date.now(),
  fetchCerts: FetchCerts = fetch,
): Promise<SuperadminAccess> {
  if (!superadminPath.test(new URL(request.url).pathname)) return { _tag: 'public' }

  if (import.meta.env.DEV && env.SUPERADMIN_ACCESS_BYPASS === 'local')
    return { _tag: 'granted', superadmin: { email: 'local-development' } }

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
    const superadmin = await verifyAccessToken(token, config.output, now, fetchCerts)

    if (superadmin) return { _tag: 'granted', superadmin }
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
): Promise<Superadmin | null> {
  const segments = /^([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(token)

  if (!segments) return null
  const [, encodedHeader, encodedClaims, encodedSignature] = segments
  const header = parseSegment(TokenHeader, encodedHeader)

  if (!header) return null
  const jwk = await signingKey(config.teamDomain, header.kid, now, fetchCerts)

  if (!jwk) return null

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`)

  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64Url(encodedSignature), signed)))
    return null

  const claims = parseSegment(TokenClaims, encodedClaims)

  if (!claims) return null
  const { aud, iss, exp, nbf, email } = claims
  const seconds = now / 1000

  if (iss !== config.teamDomain || exp <= seconds || (nbf !== undefined && nbf > seconds)) return null

  if (!(Array.isArray(aud) ? aud : [aud]).includes(config.audience)) return null

  return { email }
}

/** Per-isolate certs. A token naming an unknown key refetches them (Access rotates keys), at most every few minutes. */
const certsByTeamDomain = new Map<string, { readonly certs: Certs; readonly fetchedAt: number }>()

const certsRefetchInterval = 5 * 60 * 1000

async function signingKey(
  teamDomain: string,
  kid: string,
  now: number,
  fetchCerts: FetchCerts,
): Promise<JsonWebKey | null> {
  const cached = certsByTeamDomain.get(teamDomain)
  const cachedKey = cached?.certs.keys.find((key) => key.kid === kid)

  if (cachedKey) return cachedKey

  if (cached && now - cached.fetchedAt < certsRefetchInterval) return null
  const response = await fetchCerts(`${teamDomain}/cdn-cgi/access/certs`)

  if (!response.ok) throw new Error(`Access certs request failed with ${response.status}`)
  const certs = v.parse(Certs, await response.json())
  certsByTeamDomain.set(teamDomain, { certs, fetchedAt: now })

  return certs.keys.find((key) => key.kid === kid) ?? null
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
