import { expect, test } from 'bun:test'

import type { StrilaGamePresentation } from '@ks/gameplay/definitions'
import { resources } from '@ks/i18n'
import { createInstance } from 'i18next'

import { presentBallSet } from './strila-presentation'

test('ball presentation distinguishes selected, potted, and unavailable balls', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'en', resources })
  const t = i18n.getFixedT('en')

  const details: (typeof StrilaGamePresentation.Type)['details'] = {
    phase: 'open-play',
    situationTitle: 'Open play',
    isBallSetVisible: true,
    isPotCommandAvailable: true,
    ballStatuses: {
      0: 'object',
      1: 'potted',
      2: 'object',
      3: 'on-table',
      4: 'on-table',
      5: 'on-table',
      6: 'on-table',
      7: 'on-table',
    },
    pottedBallsBySeat: { A: [1], B: [] },
    ruleNotes: [],
  }

  const selected = presentBallSet(details, [1, 2], t)
  expect(selected.balls[1]).toMatchObject({ ball: 1, potted: true, selected: false, disabled: true })
  expect(selected.balls[2]).toMatchObject({
    ball: 2,
    potted: false,
    selected: true,
    disabled: false,
    object: true,
  })
  expect(selected.balls[3]).toMatchObject({ ball: 3, selected: false, disabled: false, object: false })

  const unavailable = presentBallSet({ ...details, isPotCommandAvailable: false }, [], t)
  expect(unavailable.hint).toBeUndefined()
  expect(unavailable.legend).toBe('Open play')
  expect(unavailable.balls.every((ball) => ball.disabled && !ball.selectable)).toBe(true)
})
