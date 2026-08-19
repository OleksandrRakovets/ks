import * as v from 'valibot'

import type { Brand } from './brand'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function encodeTime(nowMs: number): string {
  let time = nowMs
  let out = ''
  for (let i = 0; i < 10; i++) {
    const mod = time % 32
    out = ULID_ALPHABET[mod] + out
    time = Math.floor(time / 32)
  }
  return out
}

function readBits(bytes: Uint8Array, bitIndex: number, count: number): number {
  let val = 0
  for (let i = 0; i < count; i++) {
    const idx = bitIndex + i
    const b = bytes[idx >> 3] ?? 0
    const bit = (b >> (7 - (idx & 7))) & 1
    val = (val << 1) | bit
  }
  return val
}

function encodeRandom(): string {
  const bytes = new Uint8Array(10) // 80 bits
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < 16; i++) {
    const v = readBits(bytes, i * 5, 5)
    out += ULID_ALPHABET[v]
  }
  return out
}

function ulidWeb(): string {
  return `${encodeTime(Date.now())}${encodeRandom()}`
}

export type GuestPlayerId = Brand<string, 'GuestPlayerId'>
export type VerifiedPlayerId = Brand<string, 'VerifiedPlayerId'>
export type PlayerRef = Brand<string, 'PlayerRef'>
export type MatchId = Brand<string, 'MatchId'>
export type FactId = Brand<string, 'FactId'>
export type ClientId = Brand<string, 'ClientId'>

function toBrand<B extends string>(value: string): Brand<string, B> {
  // SAFETY: Brand only adds a phantom marker; the enclosing Valibot pipeline validates the string first.
  return value as Brand<string, B>
}

function ulidBrandedSchema<B extends string>() {
  return v.pipe(
    v.string(),
    v.regex(ULID_RE),
    v.transform((value) => toBrand<B>(value)),
  )
}

function minLengthBrandedSchema<B extends string>(minLength: number) {
  return v.pipe(
    v.string(),
    v.minLength(minLength),
    v.transform((value) => toBrand<B>(value)),
  )
}

export const GuestPlayerIdSchema = ulidBrandedSchema<'GuestPlayerId'>()
export const VerifiedPlayerIdSchema = ulidBrandedSchema<'VerifiedPlayerId'>()
export const PlayerRefSchema = v.pipe(
  v.string(),
  v.regex(/^(gp|vp)_[0-9A-HJKMNP-TV-Z]{26}$/),
  v.transform((value) => toBrand<'PlayerRef'>(value)),
)
export const MatchIdSchema = ulidBrandedSchema<'MatchId'>()
export const FactIdSchema = ulidBrandedSchema<'FactId'>()
export const ClientIdSchema = minLengthBrandedSchema<'ClientId'>(8)

export function newGuestPlayerId(): GuestPlayerId {
  return v.parse(GuestPlayerIdSchema, ulidWeb())
}

export function newVerifiedPlayerId(): VerifiedPlayerId {
  return v.parse(VerifiedPlayerIdSchema, ulidWeb())
}

export function newMatchId(): MatchId {
  return v.parse(MatchIdSchema, ulidWeb())
}

export function newFactId(): FactId {
  return v.parse(FactIdSchema, ulidWeb())
}

export function newClientId(): ClientId {
  return v.parse(ClientIdSchema, ulidWeb())
}

export function formatPrefixedId(prefix: 'm' | 'e' | 'c', id: string): string {
  return `${prefix}_${id}`
}

export function formatPlayerRef(kind: 'gp' | 'vp', id: string): PlayerRef {
  return v.parse(PlayerRefSchema, `${kind}_${id}`)
}

export function stripOptionalPrefix(value: string): string {
  const idx = value.indexOf('_')
  if (idx <= 0) return value
  const maybeId = value.slice(idx + 1)
  return ULID_RE.test(maybeId) ? maybeId : value
}
