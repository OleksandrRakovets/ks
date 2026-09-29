import type { BySeatNumber, Control, ProtocolEntry } from '@ks/core'

import { protocolEntryMessage, type ProtocolMessage } from './protocol'

type SeatNames = Readonly<{ A: string; B: string }>

type LastCommand = Readonly<{
  entry: ProtocolEntry
  correction?: Control
}>

export type LastCommandPresentation = Readonly<{
  message: ProtocolMessage
  score?: BySeatNumber | undefined
  correction?: Control
}>

export function presentLastCommand(lastCommand: LastCommand, seatNames: SeatNames): LastCommandPresentation {
  const presentation: LastCommandPresentation = {
    message: protocolEntryMessage(lastCommand.entry, seatNames),
    score: lastCommand.entry.scoreAfter,
  }

  return lastCommand.correction ? { ...presentation, correction: lastCommand.correction } : presentation
}
