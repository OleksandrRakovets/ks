import { z } from 'zod'

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
export type EventId = Brand<string, 'EventId'>
export type ClientId = Brand<string, 'ClientId'>

function toBrand<B extends string>(value: string): Brand<string, B> {
  return value as Brand<string, B>
}

function ulidBrandedSchema<B extends string>() {
  return z
    .string()
    .regex(ULID_RE)
    .transform((value) => toBrand<B>(value))
}

function minLengthBrandedSchema<B extends string>(minLength: number) {
  return z
    .string()
    .min(minLength)
    .transform((value) => toBrand<B>(value))
}

export const GuestPlayerIdSchema = ulidBrandedSchema<'GuestPlayerId'>()
export const VerifiedPlayerIdSchema = ulidBrandedSchema<'VerifiedPlayerId'>()
export const PlayerRefSchema = z
  .string()
  .regex(/^(gp|vp)_[0-9A-HJKMNP-TV-Z]{26}$/)
  .transform((value) => toBrand<'PlayerRef'>(value))
export const MatchIdSchema = ulidBrandedSchema<'MatchId'>()
export const EventIdSchema = ulidBrandedSchema<'EventId'>()
export const ClientIdSchema = minLengthBrandedSchema<'ClientId'>(8)

export function newGuestPlayerId(): GuestPlayerId {
  return GuestPlayerIdSchema.parse(ulidWeb())
}

export function newVerifiedPlayerId(): VerifiedPlayerId {
  return VerifiedPlayerIdSchema.parse(ulidWeb())
}

export function newMatchId(): MatchId {
  return MatchIdSchema.parse(ulidWeb())
}

export function newEventId(): EventId {
  return EventIdSchema.parse(ulidWeb())
}

export function newClientId(): ClientId {
  return ClientIdSchema.parse(ulidWeb())
}

export function formatPrefixedId(prefix: 'm' | 'e' | 'c', id: string): string {
  return `${prefix}_${id}`
}

export function formatPlayerRef(kind: 'gp' | 'vp', id: string): PlayerRef {
  return PlayerRefSchema.parse(`${kind}_${id}`)
}

export function stripOptionalPrefix(value: string): string {
  const idx = value.indexOf('_')
  if (idx <= 0) return value
  const maybeId = value.slice(idx + 1)
  return ULID_RE.test(maybeId) ? maybeId : value
}
