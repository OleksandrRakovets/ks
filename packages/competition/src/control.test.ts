import { describe, expect, test } from 'bun:test'

import { emptyControlCommandSections, newMatchId } from '@ks/core'

import { deriveSparringControlSections } from './control'
import type { MatchState } from './match-state'

function matchState(args?: Partial<MatchState>): MatchState {
  return {
    config: {
      matchId: newMatchId(),
      gameKey: 'strila-v2',
      targets: {
        frameTargetPointsBySeat: { A: 9, B: 9 },
        matchTargetFrames: 3,
      },
    },
    status: 'active',
    currentFrameIndex: 1,
    framesWonBySeat: { A: 0, B: 0 },
    frames: [
      {
        frameIndex: 1,
        pointsBySeat: { A: 9, B: 4 },
        winnerSeat: 'A',
      },
    ],
    ...args,
  }
}

describe('deriveSparringControlSections', () => {
  test('emits frame.start as a neutral match command between unfinished frames', () => {
    const sections = deriveSparringControlSections({ matchState: matchState() })

    expect(sections.secondary.neutral).toEqual([
      {
        source: 'match',
        commandType: 'frame.start',
        command: {},
        label: 'Start next frame',
        prominence: 'secondary',
      },
    ])
    expect(sections.primary.neutral).toEqual([])
    expect(sections.secondary.A).toEqual([])
    expect(sections.secondary.B).toEqual([])
  })

  test('emits match.end as a neutral match command after target is reached', () => {
    const sections = deriveSparringControlSections({
      matchState: matchState({
        framesWonBySeat: { A: 3, B: 1 },
        frames: [
          {
            frameIndex: 4,
            pointsBySeat: { A: 9, B: 4 },
            winnerSeat: 'A',
          },
        ],
        currentFrameIndex: 4,
      }),
    })

    expect(sections.secondary.neutral).toEqual([
      {
        source: 'match',
        commandType: 'match.end',
        command: {},
        label: 'End match',
        prominence: 'secondary',
      },
    ])
  })

  test('emits no match controls while current frame is unawarded', () => {
    const sections = deriveSparringControlSections({
      matchState: matchState({
        frames: [
          {
            frameIndex: 1,
            pointsBySeat: { A: 4, B: 4 },
          },
        ],
      }),
    })

    expect(sections).toEqual(emptyControlCommandSections())
  })

  test('merges match and game commands without moving buckets', () => {
    const gameSections = emptyControlCommandSections()
    gameSections.primary.A.push({
      source: 'game',
      commandType: 'pot.record',
      command: { seat: 'A', points: 1 },
      seat: 'A',
      label: '+1',
      prominence: 'primary',
    })

    const merged = deriveSparringControlSections({
      matchState: matchState(),
      gameControlProjection: { details: { commandSections: gameSections } },
    })

    expect(merged.secondary.neutral.map((command) => command.commandType)).toEqual(['frame.start'])
    expect(merged.primary.A.map((command) => command.commandType)).toEqual(['pot.record'])
    expect(merged.primary.B).toEqual([])
  })

  test('treats missing game sections as empty', () => {
    const sections = deriveSparringControlSections({
      matchState: matchState({
        framesWonBySeat: { A: 3, B: 1 },
        frames: [
          {
            frameIndex: 4,
            pointsBySeat: { A: 9, B: 4 },
            winnerSeat: 'A',
          },
        ],
        currentFrameIndex: 4,
      }),
    })

    expect(sections.secondary.neutral.map((command) => command.commandType)).toEqual(['match.end'])
  })
})
