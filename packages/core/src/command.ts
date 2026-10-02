import { Schema } from 'effect'

import { UnixEpochMilliseconds } from './clock'
import { CommandId } from './ids'
import { PositiveInteger, UnknownObject } from './valicombos'

/**
 * Complete identified intent submitted for match evaluation.
 *
 * The nested command retains the exact shape owned by competition or the selected gameplay runtime. The ID is created
 * with that command in the browser and remains part of the value through HTTP, RPC, persistence, and receipt lookup.
 */
export const MatchCommand = Schema.Struct({
  commandId: CommandId,
  source: Schema.Literals(['match', 'game']),
  command: UnknownObject,
})

/** A Match Command promoted with metadata assigned by its authoritative MatchRoom transaction. */
export const AcceptedCommand = Schema.Struct({
  ...MatchCommand.fields,
  acceptedSeq: PositiveInteger,
  acceptedAt: UnixEpochMilliseconds,
})
