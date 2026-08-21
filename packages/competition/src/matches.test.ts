import { describe, expect, test } from 'bun:test'

import { newMatchId } from '@ks/core'
import * as v from 'valibot'

import { assignmentsBySeat, buildMatchConfig, CreateMatchRequestSchema } from './matches'

const request = v.parse(CreateMatchRequestSchema, {
  gameKey: 'strila-v2',
  targets: {
    frameTargetPointsBySeat: { A: 8, B: 8 },
    matchTargetFrames: 3,
  },
  firstBreakerSeat: 'A',
  participants: [
    { seat: 'A', playerRef: 'gp_01HX0000000000000000000000' },
    { seat: 'B', playerRef: 'gp_01HX0000000000000000000001' },
  ],
})

describe('match creation helpers', () => {
  test('builds validated match config without storage dependencies', () => {
    const matchId = newMatchId()

    expect(buildMatchConfig(matchId, request)).toEqual({
      matchId,
      gameKey: 'strila-v2',
      targets: request.targets,
      firstBreakerSeat: 'A',
    })
  })

  test('requires and preserves long free pyramid game configuration', () => {
    expect(
      v.safeParse(CreateMatchRequestSchema, {
        ...request,
        gameKey: 'free-pyramid-long',
      }).success,
    ).toBe(false)

    const longRequest = v.parse(CreateMatchRequestSchema, {
      ...request,
      gameKey: 'free-pyramid-long',
      gameConfiguration: { rackRollover: 14 },
    })
    const matchId = newMatchId()

    expect(buildMatchConfig(matchId, longRequest)).toEqual({
      matchId,
      gameKey: 'free-pyramid-long',
      targets: request.targets,
      firstBreakerSeat: 'A',
      gameConfiguration: { rackRollover: 14 },
    })
  })

  test('maps participants by seat', () => {
    expect(assignmentsBySeat(request.participants)).toEqual({
      A: request.participants[0].playerRef,
      B: request.participants[1].playerRef,
    })
  })

  test('rejects non-positive targets through the core target schema', () => {
    expect(
      v.safeParse(CreateMatchRequestSchema, {
        ...request,
        targets: { ...request.targets, frameTargetPointsBySeat: { A: 0, B: 8 } },
      }).success,
    ).toBe(false)
  })
})
