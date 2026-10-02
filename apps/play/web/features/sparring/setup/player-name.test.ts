import { expect, test } from 'bun:test'

import { safeNormalizeDisplayName } from './player-name'

test('player-name normalization retains valid names and rejects blank or oversized names', () => {
  expect(safeNormalizeDisplayName('  Alice\t Smith\n')).toBe('Alice Smith')
  expect(safeNormalizeDisplayName(' \t\n')).toBeNull()
  expect(safeNormalizeDisplayName('x'.repeat(128))).toBeNull()
  expect(safeNormalizeDisplayName(` ${'x'.repeat(127)} `)).toBe('x'.repeat(127))
})
