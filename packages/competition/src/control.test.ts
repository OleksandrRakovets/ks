import { describe, expect, test } from 'bun:test'

import { emptyControlCommandSections, newMatchId, type ControlCommandSections, type MatchSnapshot } from '@ks/core'

import { deriveSparringMatchControlSections, mergeControlCommandSections } from './control'

function snapshot(args?: Partial<MatchSnapshot>): MatchSnapshot {
  return {
    matchId: newMatchId(),
    gameKey: 'strila-v2',
    targets: {
      frameTargetPointsBySeat: { A: 9, B: 9 },
      matchTargetFrames: 3,
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
    latestSeq: 1,
    ...args,
  }
}

describe('deriveSparringMatchControlSections', () => {
  test('emits frame.start as a neutral match command between unfinished frames', () => {
    const sections = deriveSparringMatchControlSections(snapshot())

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
    const sections = deriveSparringMatchControlSections(
      snapshot({
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
    )

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
    const sections = deriveSparringMatchControlSections(
      snapshot({
        frames: [
          {
            frameIndex: 1,
            pointsBySeat: { A: 4, B: 4 },
          },
        ],
      }),
    )

    expect(sections).toEqual(emptyControlCommandSections())
  })
})

describe('mergeControlCommandSections', () => {
  test('merges match and game commands without moving buckets', () => {
    const matchSections = emptyControlCommandSections()
    const gameSections = emptyControlCommandSections()

    matchSections.secondary.neutral.push({
      source: 'match',
      commandType: 'frame.start',
      command: {},
      label: 'Start next frame',
      prominence: 'secondary',
    })
    gameSections.primary.A.push({
      source: 'game',
      commandType: 'pot.record',
      command: { seat: 'A', points: 1 },
      seat: 'A',
      label: '+1',
      prominence: 'primary',
    })

    const merged = mergeControlCommandSections(matchSections, gameSections)

    expect(merged.secondary.neutral.map((command) => command.commandType)).toEqual(['frame.start'])
    expect(merged.primary.A.map((command) => command.commandType)).toEqual(['pot.record'])
    expect(merged.primary.B).toEqual([])
  })

  test('treats missing game sections as empty', () => {
    const matchSections: ControlCommandSections = emptyControlCommandSections()
    matchSections.secondary.neutral.push({
      source: 'match',
      commandType: 'match.end',
      command: {},
      label: 'End match',
      prominence: 'secondary',
    })

    expect(mergeControlCommandSections(matchSections)).toEqual(matchSections)
  })
})
