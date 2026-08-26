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
  return commands.map((command) => {
    const result = match.execute(command)
    if (result._tag !== 'accepted') throw new Error(`Expected ${command.commandType} to be accepted`)
    return result.facts
  })
}

const prepareAndCommence = [
  { source: 'match', commandType: 'frame.prepare', command: {} },
  { source: 'match', commandType: 'frame.commence', command: { seat: 'A' } },
] satisfies ControlCommand[]

test('restoreSparringMatch accepts canonical content with reordered object keys', () => {
  const [prepared] = acceptedBatches([prepareAndCommence[0]!])
  const fact = prepared![0]
  if (fact.type !== 'frame.prepared') throw new Error('Expected frame.prepared')
  const reordered: MatchFactContentBatch = [
    {
      type: 'frame.prepared',
      payload: {
        ...fact.payload,
        targetPointsBySeat: { B: fact.payload.targetPointsBySeat.B, A: fact.payload.targetPointsBySeat.A },
      },
    },
  ]
  restoreSparringMatch([[draftSparringMatchCreation(config)], reordered])
})

test('restoreSparringMatch accepts canonical content after JSON persistence', () => {
  const batches = acceptedBatches(prepareAndCommence)
  // SAFETY: JSON round-trips schema-produced semantic batches without changing their JSON value types.
  const persisted = JSON.parse(JSON.stringify(batches)) as MatchFactContentBatch[]
  restoreSparringMatch([[draftSparringMatchCreation(config)], ...persisted])
})

test('restoreSparringMatch rejects a batch whose complete content differs from canonical execution', () => {
  const creation = draftSparringMatchCreation(config)
  expect(() =>
    restoreSparringMatch([
      [creation],
      [
        {
          type: 'frame.prepared',
          payload: { frameIndex: 1, gameKey: 'free-pyramid', targetPointsBySeat: { A: 9, B: 8 }, breakerSeat: 'A' },
        },
      ],
    ]),
  ).toThrow(SparringMatchHistoryError)
})

test('restoreSparringMatch rejects facts after terminal state through canonical execution', () => {
  const batches = acceptedBatches([
    ...prepareAndCommence,
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 2 } },
    { source: 'game', commandType: 'frame.award', command: { seat: 'A' } },
  ])
  expect(() =>
    restoreSparringMatch([
      [draftSparringMatchCreation(config)],
      ...batches,
      [
        {
          type: 'frame.prepared',
          payload: { frameIndex: 2, gameKey: 'free-pyramid', targetPointsBySeat: { A: 2, B: 2 }, breakerSeat: 'B' },
        },
      ],
    ]),
  ).toThrow(SparringMatchHistoryError)
})

test('restoreSparringMatch rejects an incompatible stored game command', () => {
  const batches = acceptedBatches([
    ...prepareAndCommence,
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 1 } },
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
    ...prepareAndCommence,
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 1 } },
  ])
  const gameBatch = batches[2]!
  const fact = gameBatch[0]
  if (fact.type !== 'game.command') throw new Error('Expected game.command')
  const [entry] = fact.payload.protocolEntries
  if (!entry) throw new Error('Expected protocol entry')
  if (!entry.scoreAfter) throw new Error('Expected protocol score')
  const mismatched: MatchFactContentBatch = [
    {
      ...fact,
      payload: {
        ...fact.payload,
        protocolEntries: [{ ...entry, scoreAfter: { ...entry.scoreAfter, B: entry.scoreAfter.B + 1 } }],
      },
    },
  ]
  expect(() => restoreSparringMatch([[draftSparringMatchCreation(config)], batches[0]!, batches[1]!, mismatched])).toThrow(
    SparringMatchHistoryError,
  )
})

test('restoreSparringMatch rejects a stored completion mismatch', () => {
  const batches = acceptedBatches([
    ...prepareAndCommence,
    { source: 'game', commandType: 'pot.record', command: { seat: 'A', pottedBallCount: 2 } },
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
