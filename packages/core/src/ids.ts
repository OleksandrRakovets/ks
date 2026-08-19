import { ulid } from 'ulid'
import * as v from 'valibot'

import type { Brand } from './brand'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

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
  return v.parse(GuestPlayerIdSchema, ulid())
}

export function newVerifiedPlayerId(): VerifiedPlayerId {
  return v.parse(VerifiedPlayerIdSchema, ulid())
}

export function newMatchId(): MatchId {
  return v.parse(MatchIdSchema, ulid())
}

export function newFactId(): FactId {
  return v.parse(FactIdSchema, ulid())
}

export function newClientId(): ClientId {
  return v.parse(ClientIdSchema, ulid())
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
