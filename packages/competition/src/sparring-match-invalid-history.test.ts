import { expect, test } from 'bun:test'

import { type ControlCommand, type MatchConfig, type MatchFactContentBatch, newMatchId } from '@ks/core'

import { draftSparringMatchCreation, restoreSparringMatch, SparringMatchHistoryError } from './sparring-match'

const config: MatchConfig = {
  matchId: newMatchId(),
  gameKey: 'free-pyramid',
  targets: { frameTargetPointsBySeat: { A: 2, B: 2 }, matchTargetFrames: 1 },
  firstBreakerSeat: 'A',
}

function acceptedBatches(commands: ControlCommand[]): MatchFactContentBatch[] {
  const match = restoreSparringMatch([[draftSparringMatchCreation(config)]])
  try {
    return commands.map((command) => {
      const result = match.execute(command)
      if (result._tag !== 'accepted') throw new Error(`Expected ${command.commandType} to be accepted`)
      return result.facts
    })
  } finally {
    match.dispose()
  }
}

const startAndCommence = [
  { source: 'match', commandType: 'frame.start', command: {} },
  { source: 'match', commandType: 'frame.commence', command: { seat: 'A' } },
] satisfies ControlCommand[]

test('restoreSparringMatch accepts canonical content with reordered object keys', () => {
  const [started] = acceptedBatches([startAndCommence[0]!])
  const fact = started![0]
  if (fact.type !== 'frame.started') throw new Error('Expected frame.started')
  const reordered: MatchFactContentBatch = [
    {
      type: 'frame.started',
      payload: {
        ...fact.payload,
        targetPointsBySeat: { B: fact.payload.targetPointsBySeat.B, A: fact.payload.targetPointsBySeat.A },
      },
    },
  ]
  const restored = restoreSparringMatch([[draftSparringMatchCreation(config)], reordered])
  restored.dispose()
})

test('restoreSparringMatch accepts canonical content after JSON persistence', () => {
  const batches = acceptedBatches(startAndCommence)
  // SAFETY: JSON round-trips schema-produced semantic batches without changing their JSON value types.
  const persisted = JSON.parse(JSON.stringify(batches)) as MatchFactContentBatch[]
  const restored = restoreSparringMatch([[draftSparringMatchCreation(config)], ...persisted])
  restored.dispose()
})

test('restoreSparringMatch rejects a batch whose complete content differs from canonical execution', () => {
  const creation = draftSparringMatchCreation(config)
  expect(() =>
    restoreSparringMatch([
      [creation],
      [
        {
          type: 'frame.started',
          payload: { frameIndex: 1, gameKey: 'free-pyramid', targetPointsBySeat: { A: 9, B: 8 }, breakerSeat: 'A' },
        },
      ],
    ]),
  ).toThrow(SparringMatchHistoryError)
})

test('restoreSparringMatch rejects facts after terminal state through canonical execution', () => {
  const batches = acceptedBatches([
    ...startAndCommence,
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 2 } },
    { source: 'game', commandType: 'frame.award', command: { seat: 'A' } },
  ])
  expect(() =>
    restoreSparringMatch([
      [draftSparringMatchCreation(config)],
      ...batches,
      [
        {
          type: 'frame.started',
          payload: { frameIndex: 2, gameKey: 'free-pyramid', targetPointsBySeat: { A: 2, B: 2 }, breakerSeat: 'B' },
        },
      ],
    ]),
  ).toThrow(SparringMatchHistoryError)
})

test('restoreSparringMatch rejects an incompatible stored game command', () => {
  const batches = acceptedBatches([
    ...startAndCommence,
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 1 } },
  ])
  const gameBatch = batches[2]!
  const fact = gameBatch[0]
  if (fact.type !== 'game.command') throw new Error('Expected game.command')
  const incompatible: MatchFactContentBatch = [{ ...fact, payload: { ...fact.payload, gameKey: 'combined-pyramid' } }]
  expect(() => restoreSparringMatch([[draftSparringMatchCreation(config)], batches[0]!, batches[1]!, incompatible])).toThrow(
    SparringMatchHistoryError,
  )
})

test('restoreSparringMatch rejects a stored protocol mismatch', () => {
  const batches = acceptedBatches([
    ...startAndCommence,
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 1 } },
  ])
  const gameBatch = batches[2]!
  const fact = gameBatch[0]
  if (fact.type !== 'game.command') throw new Error('Expected game.command')
  const mismatched: MatchFactContentBatch = [{ ...fact, payload: { ...fact.payload, protocolEntries: [] } }]
  expect(() => restoreSparringMatch([[draftSparringMatchCreation(config)], batches[0]!, batches[1]!, mismatched])).toThrow(
    SparringMatchHistoryError,
  )
})

test('restoreSparringMatch rejects a stored completion mismatch', () => {
  const batches = acceptedBatches([
    ...startAndCommence,
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', points: 2 } },
    { source: 'game', commandType: 'frame.award', command: { seat: 'A' } },
  ])
  const completionBatch = batches[3]!
  const completion = completionBatch.find((fact) => fact.type === 'frame.completed')
  if (!completion || completion.type !== 'frame.completed') throw new Error('Expected frame.completed')
  const changed = completionBatch.map((fact) =>
    fact === completion
      ? {
          ...completion,
          payload: { ...completion.payload, outcome: { ...completion.payload.outcome, winnerSeat: 'B' as const } },
        }
      : fact,
  )
  const mismatched: MatchFactContentBatch = [changed[0]!, ...changed.slice(1)]
  expect(() =>
    restoreSparringMatch([[draftSparringMatchCreation(config)], batches[0]!, batches[1]!, batches[2]!, mismatched]),
  ).toThrow(SparringMatchHistoryError)
})
