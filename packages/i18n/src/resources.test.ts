import { expect, test } from 'bun:test'

import { resources } from './resources'

type MessageTree = { [key: string]: string | MessageTree }

function messageKeys(value: MessageTree, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key

    if (Object.prototype.toString.call(entry) === '[object String]') return [path]

    // SAFETY: MessageTree has only string leaves, so a non-primitive entry is another MessageTree.
    return messageKeys(entry as MessageTree, path)
  })
}

test('English and Ukrainian resources expose the same message keys', () => {
  expect(messageKeys(resources.en.translation).sort()).toEqual(messageKeys(resources.uk.translation).sort())
})
