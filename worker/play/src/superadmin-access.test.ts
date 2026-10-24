import { expect, test } from 'bun:test'

import { checkSuperadminAccess } from './superadmin-access'

type Claims = { aud: string[]; iss: string; exp: number; iat: number; nbf?: number; email?: string }

const audience = 'a'.repeat(64)

const now = Date.UTC(2026, 9, 24, 12)

const minute = 60 * 1000

const granted20 = Array.from({ length: 20 }, () => 'granted' as const)

const algorithm = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}

const accessKeys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])

const forgedKeys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])

const publicJwk = await crypto.subtle.exportKey('jwk', accessKeys.publicKey)

let teams = 0

/**
 * A fresh Access team per test: the gate caches certs per team domain, so no test depends on
 * another's cache. `certs` controls what the next certs fetch answers.
 */
function accessTeam() {
  const teamDomain = `https://ks-test-${++teams}.cloudflareaccess.com`
  const env = { SUPERADMIN_ACCESS_TEAM_DOMAIN: teamDomain, SUPERADMIN_ACCESS_AUD: audience }
  const team = { certsFetches: 0, certs: { status: 200, keys: [{ ...publicJwk, kid: 'access-key' }] } }

  const validClaims: Claims = {
    aud: [audience],
    iss: teamDomain,
    exp: now / 1000 + 24 * 60 * 60,
    iat: now / 1000 - 60,
    email: 'owner@example.com',
  }

  async function fetchCerts(url: string) {
    team.certsFetches += 1

    if (url !== `${teamDomain}/cdn-cgi/access/certs`) return new Response(null, { status: 404 })

    return team.certs.status === 200
      ? Response.json({ keys: team.certs.keys })
      : new Response(null, { status: team.certs.status })
  }

  async function outcome(path: string, assertion?: string, at = now, accessEnv: typeof env = env) {
    const request = new Request(
      `https://play.ks.ua${path}`,
      assertion === undefined ? {} : { headers: { 'Cf-Access-Jwt-Assertion': assertion } },
    )

    const access = await checkSuperadminAccess(request, accessEnv, at, fetchCerts)

    return access._tag === 'denied' ? access.response.status : access._tag
  }

  return { env, team, validClaims, outcome }
}

async function token(claims: Claims, signingKey = accessKeys.privateKey, kid = 'access-key') {
  const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
  const header = JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })
  const unsigned = `${encode(Buffer.from(header))}.${encode(Buffer.from(JSON.stringify(claims)))}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(unsigned),
  )

  return `${unsigned}.${encode(new Uint8Array(signature))}`
}

test('a valid Access token grants superadmin pages and their Router data', async () => {
  const { validClaims, outcome } = accessTeam()
  const assertion = await token(validClaims)

  for (const path of [
    '/superadmin/',
    '/superadmin/_.data',
    '/superadmin.data',
    '/superadmin/_.data?_routes=root',
  ])
    expect(await outcome(path, assertion)).toBe('granted')
})

test('superadmin paths without a valid token are rejected, including encoded and case variants', async () => {
  const { validClaims, outcome } = accessTeam()
  const { email: _, ...serviceTokenClaims } = validClaims

  const rejected = [
    await outcome('/superadmin/'),
    await outcome('/SuperAdmin/'),
    await outcome('/%73uperadmin/_.data?_routes=root'),
    await outcome('/super%61dmin/_.data'),
    await outcome('//superadmin/'),
    await outcome('/superadmin/%E0%A4%A'),
    await outcome('/superadmin/_.data', 'not-a-jwt'),
    await outcome('/superadmin/', await token({ ...validClaims, aud: ['b'.repeat(64)] })),
    await outcome('/superadmin/', await token({ ...validClaims, iss: 'https://other.cloudflareaccess.com' })),
    await outcome('/superadmin/', await token({ ...validClaims, exp: now / 1000 })),
    await outcome('/superadmin/', await token({ ...validClaims, nbf: now / 1000 + 60 })),
    await outcome('/superadmin/', await token(serviceTokenClaims)),
    await outcome('/superadmin/', await token(validClaims, forgedKeys.privateKey)),
  ]

  expect(rejected).toEqual(rejected.map(() => 403))
})

test('missing Access configuration rejects even a token that would otherwise be valid', async () => {
  const { env, validClaims, outcome } = accessTeam()
  const assertion = await token(validClaims)

  expect(await outcome('/superadmin/', assertion, now, { ...env, SUPERADMIN_ACCESS_AUD: '' })).toBe(403)
  expect(await outcome('/superadmin/', assertion, now, { ...env, SUPERADMIN_ACCESS_TEAM_DOMAIN: '' })).toBe(
    403,
  )
})

test('other paths are public, including ones that merely start with the same letters', async () => {
  const { outcome } = accessTeam()

  for (const path of ['/', '/sparring/', '/superadministrator/', '/en/superadmin/', '/%65n/superadmin/'])
    expect(await outcome(path)).toBe('public')
})

test('unavailable certs reject valid tokens, and failed fetches are retried at most every 30 seconds', async () => {
  const { team, validClaims, outcome } = accessTeam()
  const assertion = await token(validClaims)
  team.certs.status = 503

  expect(await outcome('/superadmin/', assertion)).toBe(403)
  expect(await outcome('/superadmin/', assertion, now + 10 * 1000)).toBe(403)
  expect(team.certsFetches).toBe(1)

  team.certs.status = 200

  expect(await outcome('/superadmin/', assertion, now + 31 * 1000)).toBe('granted')
  expect(team.certsFetches).toBe(2)
})

test('concurrent requests share one certs fetch, including the refetch for a rotated key', async () => {
  const { team, validClaims, outcome } = accessTeam()

  const concurrently = (assertion: string, at: number) =>
    Promise.all(Array.from({ length: 20 }, () => outcome('/superadmin/', assertion, at)))

  expect(await concurrently(await token(validClaims), now)).toEqual(granted20)
  expect(team.certsFetches).toBe(1)

  team.certs.keys = [{ ...publicJwk, kid: 'rotated-key' }]
  const rotated = await token(validClaims, accessKeys.privateKey, 'rotated-key')

  expect(await outcome('/superadmin/', rotated, now + minute)).toBe(403)
  expect(await concurrently(rotated, now + 6 * minute)).toEqual(granted20)
  expect(team.certsFetches).toBe(2)
})

test('a key Access removed stops being trusted once the cached certs are an hour old', async () => {
  const { team, validClaims, outcome } = accessTeam()
  const assertion = await token(validClaims)

  expect(await outcome('/superadmin/', assertion)).toBe('granted')
  team.certs.keys = []

  expect(await outcome('/superadmin/', assertion, now + 59 * minute)).toBe('granted')
  expect(await outcome('/superadmin/', assertion, now + 61 * minute)).toBe(403)
})
