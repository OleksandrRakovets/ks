import { describe, expect, test } from 'bun:test'

import { parseGameKey } from './gameplay'
import { getGameMeta, listGameKeys } from './registry'

describe('game registry', () => {
  test('lists registered game keys', () => {
    expect(listGameKeys()).toEqual([
      'strila-v2',
      'free-pyramid',
      'free-pyramid-long',
      'combined-pyramid',
      'combined-pyramid-old',
    ])
  })

  test('parses a supported game key', () => {
    expect(parseGameKey('free-pyramid')).toBe('free-pyramid')
  })

  test('returns free pyramid metadata', () => {
    expect(getGameMeta('free-pyramid')).toEqual({
      title: {
        uk: 'Вільна піраміда',
        en: 'Free pyramid',
      },
      inputMode: 'pyramid-basic',
      defaultFrameTargetPointsBySeat: { A: 8, B: 8 },
    })
  })

  test('returns long free pyramid metadata', () => {
    expect(getGameMeta('free-pyramid-long')).toEqual({
      title: {
        uk: 'Вільна піраміда з продовженням',
        en: 'Free pyramid (long)',
      },
      inputMode: 'pyramid-basic',
      defaultFrameTargetPointsBySeat: { A: 30, B: 30 },
    })
  })

  test('returns Strila metadata', () => {
    expect(getGameMeta('strila-v2')).toEqual({
      title: {
        uk: 'Стріла',
        en: 'Strila',
      },
      inputMode: 'strila-basic',
      defaultFrameTargetPointsBySeat: { A: 9, B: 9 },
    })
  })
})
