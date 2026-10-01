import { describe, expect, test } from 'bun:test'

import { PlayerRef } from '@ks/core'
import * as v from 'valibot'

import { presentParticipant, splitGuestDisplayName } from './players'
import type { ParticipantRecord } from './records'

const playerRef = v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')

function localized(firstName: string, lastName: string): ParticipantRecord {
  return {
    playerRef,
    names: { uk: { firstName, lastName }, en: { firstName, lastName } },
  }
}

describe('participant presentation boundary', () => {
  test('permits the longest creation-safe generated short form', () => {
    const lastName = 'x'.repeat(125)
    expect(presentParticipant(localized('A', lastName), 'en')).toEqual({
      playerRef,
      displayName: `A ${lastName}`,
      shortDisplayName: `A. ${lastName}`,
    })
  })

  test.each([
    ['empty names', localized('', '')],
    ['oversized display name', localized('Alice', 'x'.repeat(123))],
    ['oversized generated short name', localized('A', 'x'.repeat(126))],
  ])('rejects corrupt %s', (_label, participant) => {
    expect(() => presentParticipant(participant, 'en')).toThrow()
  })

  test('parses the missing-row fallback through the same canonical schema', () => {
    expect(presentParticipant({ playerRef, names: null }, 'en')).toEqual({
      playerRef,
      displayName: playerRef,
      shortDisplayName: playerRef,
    })
  })

  test('selects localized names and abbreviates the first name', () => {
    const participant: ParticipantRecord = {
      playerRef,
      names: {
        uk: { firstName: 'Олена', lastName: 'Коваль' },
        en: { firstName: 'Olena', lastName: 'Koval' },
      },
    }

    expect(presentParticipant(participant, 'uk').shortDisplayName).toBe('О. Коваль')
    expect(presentParticipant(participant, 'en').displayName).toBe('Olena Koval')
  })

  test('presents a surname without a first name', () => {
    expect(presentParticipant(localized('', ' Koval '), 'en')).toEqual({
      playerRef,
      displayName: 'Koval',
      shortDisplayName: 'Koval',
    })
  })
})

describe('guest display-name splitting', () => {
  test.each([
    ['Koval', { firstName: '', lastName: 'Koval' }],
    ['Olena Koval', { firstName: 'Olena', lastName: 'Koval' }],
    ['Olena van Koval', { firstName: 'Olena', lastName: 'van Koval' }],
    ['Olena  Koval', { firstName: 'Olena', lastName: ' Koval' }],
    ['', { firstName: '', lastName: '' }],
  ])('splits %j without normalizing whitespace', (displayName, name) => {
    expect(splitGuestDisplayName(displayName)).toEqual(name)
  })
})
