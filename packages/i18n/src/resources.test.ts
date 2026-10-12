import { expect, test } from 'bun:test'

import { resources } from './resources'

type MessageTree = { [key: string]: string | MessageTree }

const pluralSuffix = /_(zero|one|two|few|many|other)$/

function messageKeys(value: MessageTree, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key

    if (Object.prototype.toString.call(entry) === '[object String]') return [path]

    // SAFETY: MessageTree has only string leaves, so a non-primitive entry is another MessageTree.
    return messageKeys(entry as MessageTree, path)
  })
}

function baseKeys(keys: readonly string[]): string[] {
  return [...new Set(keys.map((key) => key.replace(pluralSuffix, '')))].sort()
}

test('English and Ukrainian resources expose the same message keys', () => {
  expect(baseKeys(messageKeys(resources.en.translation))).toEqual(
    baseKeys(messageKeys(resources.uk.translation)),
  )
})

test.each(['en', 'uk'] as const)('%s plural messages cover every plural category of the locale', (locale) => {
  const keys = messageKeys(resources[locale].translation)
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories

  for (const base of new Set(
    keys.filter((key) => pluralSuffix.test(key)).map((key) => key.replace(pluralSuffix, '')),
  ))
    expect(keys.filter((key) => key.startsWith(`${base}_`)).sort()).toEqual(
      categories.map((category) => `${base}_${category}`).sort(),
    )
})
