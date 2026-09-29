import { BySeatNumber, GameKey, Seat, SizedString } from '@ks/core'
import * as v from 'valibot'

export const GameProtocolEntryFields = {
  gameKey: GameKey,
  source: v.picklist(['player', 'system']),
  entryType: SizedString(1, 64),
  seat: Seat,
  scoreAfter: v.optional(BySeatNumber),
} as const
