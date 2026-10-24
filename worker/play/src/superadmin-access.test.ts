import { expect, test } from 'bun:test'

import { checkSuperadminAccess } from './superadmin-access'

type Claims = { aud: string[]; iss: string; exp: number; iat: number; nbf?: number; email: string }

const teamDomain = 'https://ks-test.cloudflareaccess.com'

const audience = 'a'.repeat(64)

const now = Date.UTC(2026, 9, 24, 12)

const env = { SUPERADMIN_ACCESS_TEAM_DOMAIN: teamDomain, SUPERADMIN_ACCESS_AUD: audience }

const algorithm = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
}

const accessKeys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])

const forgedKeys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify'])

const publicJwk = await crypto.subtle.exportKey('jwk', accessKeys.publicKey)

const validClaims: Claims = {
  aud: [audience],
  iss: teamDomain,
  exp: now / 1000 + 60,
  iat: now / 1000 - 60,
  email: 'owner@example.com',
}

async function fetchCerts(url: string) {
  return url === `${teamDomain}/cdn-cgi/access/certs`
    ? Response.json({ keys: [{ ...publicJwk, kid: 'access-key' }] })
    : new Response(null, { status: 404 })
}

async function token(claims = validClaims, signingKey = accessKeys.privateKey) {
  const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
  const header = JSON.stringify({ alg: 'RS256', kid: 'access-key', typ: 'JWT' })
  const unsigned = `${encode(Buffer.from(header))}.${encode(Buffer.from(JSON.stringify(claims)))}`

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    new TextEncoder().encode(unsigned),
  )

  return `${unsigned}.${encode(new Uint8Array(signature))}`
}

function request(path: string, assertion?: string) {
  return new Request(
    `https://play.ks.ua${path}`,
    assertion === undefined ? {} : { headers: { 'Cf-Access-Jwt-Assertion': assertion } },
  )
}

async function outcome(path: string, assertion?: string, accessEnv: typeof env = env) {
  const access = await checkSuperadminAccess(request(path, assertion), accessEnv, now, fetchCerts)

  return access._tag === 'denied' ? access.response.status : access
}

test('a valid Access token grants superadmin pages and their Router data in both locales', async () => {
  const assertion = await token()

  for (const path of ['/superadmin/', '/en/superadmin/', '/superadmin/_.data', '/superadmin.data'])
    expect(await outcome(path, assertion)).toEqual({
      _tag: 'granted',
      superadmin: { email: 'owner@example.com' },
    })
})

test('superadmin paths without a valid token are rejected, including case variants of the route', async () => {
  const rejected = [
    await outcome('/superadmin/'),
    await outcome('/SuperAdmin/'),
    await outcome('/en/superadmin/_.data', 'not-a-jwt'),
    await outcome('/superadmin/', await token({ ...validClaims, aud: ['b'.repeat(64)] })),
    await outcome('/superadmin/', await token({ ...validClaims, iss: 'https://other.cloudflareaccess.com' })),
    await outcome('/superadmin/', await token({ ...validClaims, exp: now / 1000 })),
    await outcome('/superadmin/', await token({ ...validClaims, nbf: now / 1000 + 60 })),
    await outcome('/superadmin/', await token(validClaims, forgedKeys.privateKey)),
  ]

  expect(rejected).toEqual(rejected.map(() => 403))
})

test('missing Access configuration rejects even a token that would otherwise be valid', async () => {
  const assertion = await token()

  expect(await outcome('/superadmin/', assertion, { ...env, SUPERADMIN_ACCESS_AUD: '' })).toBe(403)
  expect(await outcome('/superadmin/', assertion, { ...env, SUPERADMIN_ACCESS_TEAM_DOMAIN: '' })).toBe(403)
})

test('other paths are public, including ones that merely start with the same letters', async () => {
  for (const path of ['/', '/sparring/', '/superadministrator/', '/en/sparring/superadmin/'])
    expect(await outcome(path)).toEqual({ _tag: 'public' })
})
