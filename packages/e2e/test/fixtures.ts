import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { inject } from 'vitest'

/**
 * Moves completed lifecycle rows back by sixteen minutes in this run's disposable D1 only.
 * The browser's accelerated clock cannot advance Workerd. Age both timestamps to preserve
 * their ordering, so the real list query sees the same cutoff as the returning client.
 * All completed rows must move: the page-wide clock also advances their expiry deadlines.
 * Moving just the target leaves other recent rows artificially overdue on every server read.
 * This is a clock-gap fixture, not an application write path or a final-state correction.
 * Archive contents remain untouched; these tests only exercise list membership/expiry.
 */
export async function ageCompletedMatches() {
  const root = resolve(inject('statePath'), 'v3/d1/miniflare-D1DatabaseObject')
  const files = (await readdir(root)).filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
  const file = files[0]

  if (file === undefined || files.length !== 1) throw new Error('Expected one disposable E2E D1 database')
  const database = new DatabaseSync(resolve(root, file))

  try {
    const gap = 16 * 60_000
    database
      .prepare(
        "UPDATE sparring_matches SET created_at = created_at - ?, ended_at = ended_at - ? WHERE status = 'finished'",
      )
      .run(gap, gap)
  } finally {
    database.close()
  }
}
