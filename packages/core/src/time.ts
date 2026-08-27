import * as v from 'valibot'

import type { Brand } from './brand'
import { NonNegativeInteger } from './valicombos'

export type UnixEpochMilliseconds = Brand<number, 'UnixEpochMilliseconds'>

function toUnixEpochMilliseconds(value: number): UnixEpochMilliseconds {
  // SAFETY: The brand records the unit/epoch invariant after the enclosing schema validates the numeric representation.
  return value as UnixEpochMilliseconds
}

export const UnixEpochMilliseconds = v.pipe(NonNegativeInteger, v.transform(toUnixEpochMilliseconds))

export function nowUnixEpochMilliseconds(): UnixEpochMilliseconds {
  return v.parse(UnixEpochMilliseconds, Date.now())
}
