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

function ulidBranded<B extends string>() {
  return v.pipe(
    v.string(),
    v.regex(ULID_RE),
    v.transform((value) => toBrand<B>(value)),
  )
}

export const GuestPlayerId = ulidBranded<'GuestPlayerId'>()
export const VerifiedPlayerId = ulidBranded<'VerifiedPlayerId'>()
export const PlayerRef = v.pipe(
  v.string(),
  v.regex(/^(gp|vp)_[0-9A-HJKMNP-TV-Z]{26}$/),
  v.transform((value) => toBrand<'PlayerRef'>(value)),
)
export const MatchId = ulidBranded<'MatchId'>()
export const CommandId = ulidBranded<'CommandId'>()

export function newGuestPlayerId(): GuestPlayerId {
  return v.parse(GuestPlayerId, ulid())
}

export function newVerifiedPlayerId(): VerifiedPlayerId {
  return v.parse(VerifiedPlayerId, ulid())
}

export function newMatchId(): MatchId {
  return v.parse(MatchId, ulid())
}

export function newCommandId(): CommandId {
  return v.parse(CommandId, ulid())
}

export function formatPlayerRef(kind: 'gp' | 'vp', id: string): PlayerRef {
  return v.parse(PlayerRef, `${kind}_${id}`)
}

export function stripOptionalPrefix(value: string): string {
  const idx = value.indexOf('_')
  if (idx <= 0) return value
  const maybeId = value.slice(idx + 1)
  return ULID_RE.test(maybeId) ? maybeId : value
}
