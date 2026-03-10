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

export type PlayerId = Brand<string, 'PlayerId'>
export type MatchId = Brand<string, 'MatchId'>
export type EventId = Brand<string, 'EventId'>
export type ClientId = Brand<string, 'ClientId'>

export const PlayerIdSchema = z
  .string()
  .regex(ULID_RE)
  .transform((v) => v as PlayerId)
export const MatchIdSchema = z
  .string()
  .regex(ULID_RE)
  .transform((v) => v as MatchId)
export const EventIdSchema = z
  .string()
  .regex(ULID_RE)
  .transform((v) => v as EventId)
export const ClientIdSchema = z
  .string()
  .min(8)
  .transform((v) => v as ClientId)

export function newPlayerId(): PlayerId {
  return ulidWeb() as PlayerId
}

export function newMatchId(): MatchId {
  return ulidWeb() as MatchId
}

export function newEventId(): EventId {
  return ulidWeb() as EventId
}

export function newClientId(): ClientId {
  return ulidWeb() as ClientId
}

export function formatPrefixedId(prefix: 'm' | 'p' | 'e' | 'c', id: string): string {
  return `${prefix}_${id}`
}

export function stripOptionalPrefix(value: string): string {
  const idx = value.indexOf('_')
  if (idx <= 0) return value
  const maybeId = value.slice(idx + 1)
  return ULID_RE.test(maybeId) ? maybeId : value
}
