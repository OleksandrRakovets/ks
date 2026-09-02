import * as v from 'valibot'

import { CommandId } from './ids'
import { UnknownObject } from './valicombos'

/**
 * Complete identified intent submitted for match evaluation.
 *
 * The nested command retains the exact shape owned by competition or the selected gameplay runtime. The ID is created
 * with that command in the browser and remains part of the value through HTTP, RPC, persistence, and active replay.
 */
export const MatchCommand = v.pipe(
  v.object({
    commandId: CommandId,
    source: v.picklist(['match', 'game']),
    command: UnknownObject,
  }),
  v.readonly(),
)
export type MatchCommand = v.InferOutput<typeof MatchCommand>
