import * as v from 'valibot'

import type { Brand } from './brand'
import { NonNegativeIntegerSchema } from './valicombos'

export type UnixEpochMilliseconds = Brand<number, 'UnixEpochMilliseconds'>

function toUnixEpochMilliseconds(value: number): UnixEpochMilliseconds {
  // SAFETY: The brand records the unit/epoch invariant after the enclosing schema validates the numeric representation.
  return value as UnixEpochMilliseconds
}

export const UnixEpochMillisecondsSchema = v.pipe(
  NonNegativeIntegerSchema,
  v.transform(toUnixEpochMilliseconds),
)

export function nowUnixEpochMilliseconds(): UnixEpochMilliseconds {
  return v.parse(UnixEpochMillisecondsSchema, Date.now())
}
