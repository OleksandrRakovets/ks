import { Schema } from 'effect'
import { ulid } from 'ulid'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

const Ulid = Schema.String.check(Schema.isPattern(ULID_RE))

export const GuestPlayerId = Ulid.pipe(Schema.brand('GuestPlayerId'))

export const VerifiedPlayerId = Ulid.pipe(Schema.brand('VerifiedPlayerId'))

export const PlayerRef = Schema.String.check(Schema.isPattern(/^(gp|vp)_[0-9A-HJKMNP-TV-Z]{26}$/)).pipe(
  Schema.brand('PlayerRef'),
)

export const MatchId = Ulid.pipe(Schema.brand('MatchId'))

export const CommandId = Ulid.pipe(Schema.brand('CommandId'))

export function newGuestPlayerId(): typeof GuestPlayerId.Type {
  return Schema.decodeUnknownSync(GuestPlayerId)(ulid())
}

export function newVerifiedPlayerId(): typeof VerifiedPlayerId.Type {
  return Schema.decodeUnknownSync(VerifiedPlayerId)(ulid())
}

export function newMatchId(): typeof MatchId.Type {
  return Schema.decodeUnknownSync(MatchId)(ulid())
}

export function newCommandId(): typeof CommandId.Type {
  return Schema.decodeUnknownSync(CommandId)(ulid())
}

export function formatPlayerRef(kind: 'gp' | 'vp', id: string): typeof PlayerRef.Type {
  return Schema.decodeUnknownSync(PlayerRef)(`${kind}_${id}`)
}
