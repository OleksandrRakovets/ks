import { expect, test } from 'bun:test'

import { createInitialSnapshot, sendEvent } from '../machine'
import { deriveStrilaControlView } from './control'

test('projects exact open-play controls and selectable balls', () => {
  const snapshot = sendEvent(createInitialSnapshot({ A: 9, B: 9 }), { type: 'frame.commence', seat: 'A' })
  const control = deriveStrilaControlView(snapshot)

  expect(control).toMatchObject({
    gameKey: 'strila-v2',
    projection: 'control',
    score: { A: 0, B: 0 },
    details: {
      phase: 'open-play',
      situationTitle: 'Open play',
      situationSummary: 'Log pots or a foul.',
      isPotCommandAvailable: true,
      ballStatuses: {
        0: 'object',
        1: 'object',
        2: 'object',
        3: 'on-table',
        4: 'on-table',
        5: 'on-table',
        6: 'on-table',
        7: 'on-table',
      },
      messages: [],
    },
  })
  expect(control.details.controlSections).toEqual({
    primary: {
      A: [{ source: 'game', type: 'pot.record', fixedInput: {}, seat: 'A', prominence: 'primary' }],
      B: [{ source: 'game', type: 'pot.record', fixedInput: {}, seat: 'B', prominence: 'primary' }],
    },
    secondary: {
      A: [{ source: 'game', type: 'foul.commit', fixedInput: {}, seat: 'A', prominence: 'secondary' }],
      B: [{ source: 'game', type: 'foul.commit', fixedInput: {}, seat: 'B', prominence: 'secondary' }],
    },
    tertiary: { A: [], B: [] },
    neutral: [],
  })

  control.score.A = 99
  control.details.ballStatuses[1] = 'potted'
  expect(deriveStrilaControlView(snapshot).score.A).toBe(0)
  expect(deriveStrilaControlView(snapshot).details.ballStatuses[1]).toBe('object')
})
