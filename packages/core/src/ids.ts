import { ulid } from 'ulid'
import * as v from 'valibot'

import type { Brand } from './brand'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

export type GuestPlayerId = Brand<string, 'GuestPlayerId'>
export type VerifiedPlayerId = Brand<string, 'VerifiedPlayerId'>
export type PlayerRef = Brand<string, 'PlayerRef'>
export type MatchId = Brand<string, 'MatchId'>
export type CommandId = Brand<string, 'CommandId'>

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

export const GuestPlayerIdSchema = ulidBrandedSchema<'GuestPlayerId'>()
export const VerifiedPlayerIdSchema = ulidBrandedSchema<'VerifiedPlayerId'>()
export const PlayerRefSchema = v.pipe(
  v.string(),
  v.regex(/^(gp|vp)_[0-9A-HJKMNP-TV-Z]{26}$/),
  v.transform((value) => toBrand<'PlayerRef'>(value)),
)
export const MatchIdSchema = ulidBrandedSchema<'MatchId'>()
export const CommandIdSchema = ulidBrandedSchema<'CommandId'>()

export function newGuestPlayerId(): GuestPlayerId {
  return v.parse(GuestPlayerIdSchema, ulid())
}

export function newVerifiedPlayerId(): VerifiedPlayerId {
  return v.parse(VerifiedPlayerIdSchema, ulid())
}

export function newMatchId(): MatchId {
  return v.parse(MatchIdSchema, ulid())
}

export function newCommandId(): CommandId {
  return v.parse(CommandIdSchema, ulid())
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
