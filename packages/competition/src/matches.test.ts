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
    })
  })

  test('maps participants by seat', () => {
    expect(assignmentsBySeat(request.participants)).toEqual({
      A: 'gp_01HX0000000000000000000000',
      B: 'gp_01HX0000000000000000000001',
    })
  })
})
