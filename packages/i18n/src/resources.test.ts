import { expect, test } from 'bun:test'

import { resources } from './resources'

function messageKeys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof entry === 'string') return [path]
    return messageKeys(entry as Record<string, unknown>, path)
  })
}

test('English and Ukrainian resources expose the same message keys', () => {
  expect(messageKeys(resources.en.translation).sort()).toEqual(messageKeys(resources.uk.translation).sort())
})
