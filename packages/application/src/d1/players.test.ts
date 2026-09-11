import { describe, expect, test } from 'bun:test'

import { PlayerRef } from '@ks/core'
import * as v from 'valibot'

import { hydrateParticipant } from './players'
import type { ApplicationDatabase } from './types'

const playerRef = v.parse(PlayerRef, 'gp_01ARZ3NDEKTSV4RRFFQ69G5FAA')

type LocalizedPlayerRow = {
  firstNameUk: string
  lastNameUk: string
  firstNameEn: string
  lastNameEn: string
}

function databaseReturning(row: LocalizedPlayerRow | null): ApplicationDatabase {
  const query = {
    from() {
      return this
    },
    where() {
      return this
    },
    async get() {
      return row
    },
  }
  // SAFETY: hydrateParticipant only uses the select query chain installed below.
  const db = {} as ApplicationDatabase
  Object.defineProperty(db, 'select', { value: () => query })
  return db
}

function localized(firstName: string, lastName: string): LocalizedPlayerRow {
  return {
    firstNameUk: firstName,
    lastNameUk: lastName,
    firstNameEn: firstName,
    lastNameEn: lastName,
  }
}

describe('D1 participant hydration boundary', () => {
  test('parses D1 names and permits the longest creation-safe generated short form', async () => {
    const lastName = 'x'.repeat(125)
    expect(await hydrateParticipant(databaseReturning(localized('A', lastName)), playerRef, 'en')).toEqual({
      playerRef,
      displayName: `A ${lastName}`,
      shortDisplayName: `A. ${lastName}`,
    })
  })

  test.each([
    ['empty names', localized('', '')],
    ['oversized display name', localized('Alice', 'x'.repeat(123))],
    ['oversized generated short name', localized('A', 'x'.repeat(126))],
  ])('rejects corrupt D1 %s', async (_label, row) => {
    let error: Error | undefined
    try {
      await hydrateParticipant(databaseReturning(row), playerRef, 'en')
    } catch (reason) {
      if (!(reason instanceof Error)) throw reason
      error = reason
    }
    expect(error).toBeInstanceOf(Error)
  })

  test('parses the missing-row fallback through the same canonical schema', async () => {
    expect(await hydrateParticipant(databaseReturning(null), playerRef, 'en')).toEqual({
      playerRef,
      displayName: playerRef,
      shortDisplayName: playerRef,
    })
  })
})
