import { expect, test } from 'bun:test'

import { type AcceptedCommandHistoryEntry, type MatchConfig, newCommandId, newMatchId } from '@ks/core'

import { createSparringMatch, restoreSparringMatch, SparringMatchHistoryError } from './sparring-match'

const config: MatchConfig = {
  matchId: newMatchId(),
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
}

function prepared(): AcceptedCommandHistoryEntry {
  const result = createSparringMatch(config).execute({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.prepare' },
  })
  if (result._tag !== 'accepted') throw new Error('Expected acceptance')
  return { command: result.command, protocolEntryContents: [...result.protocolEntryContents] }
}

test('restoration rejects Protocol semantics divergent from canonical execution', () => {
  const record = prepared()
  expect(() =>
    restoreSparringMatch(config, [
      {
        ...record,
        protocolEntryContents: [
          { ...record.protocolEntryContents[0], seat: 'B' as const },
          ...record.protocolEntryContents.slice(1).map((entry) => ({ ...entry, seat: 'B' as const })),
        ],
      },
    ]),
  ).toThrow(SparringMatchHistoryError)
})

test('restoration rejects a noncanonical or incompatible stored command', () => {
  const record = prepared()
  expect(() =>
    restoreSparringMatch(config, [{ ...record, command: { ...record.command, command: { extra: true } } }]),
  ).toThrow(SparringMatchHistoryError)
})
