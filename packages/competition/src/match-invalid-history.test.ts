import { expect, test } from 'bun:test'

import { type AcceptedCommand, type MatchConfig, newCommandId, newMatchId, SystemClock } from '@ks/core'

import { createMatch, MatchHistoryError, restoreMatch } from './match'

const config: MatchConfig = {
  matchId: newMatchId(),
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 8, B: 8 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
}

function prepared(): AcceptedCommand {
  const result = createMatch(config).execute({
    commandId: newCommandId(),
    source: 'match',
    command: { type: 'frame.prepare' },
  })

  if (result._tag !== 'accepted') throw new Error('Expected acceptance')

  return { ...result.command, acceptedSeq: 1, acceptedAt: new SystemClock().nowMs() }
}

test('restoration rejects a noncanonical or incompatible stored command', () => {
  const record = prepared()
  expect(() => restoreMatch(config, [{ ...record, command: { extra: true } }])).toThrow(MatchHistoryError)
})
