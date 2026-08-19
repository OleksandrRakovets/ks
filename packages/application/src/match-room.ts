import type { D1Database } from '@cloudflare/workers-types'
import type { StoredFact } from '@ks/core'

import { recordCompletedMatch, registerActiveMatch, type ActiveMatchCatalogInput } from './d1/match-lifecycle'
import { createApplicationDatabase } from './d1/types'
import { prepareProtocolRowsForArchive, PROTOCOL_ARCHIVE_VERSION } from './protocol'

export { prepareProtocolRowsForArchive, PROTOCOL_ARCHIVE_VERSION, type ProtocolArchiveRow } from './protocol'

export async function registerActiveMatchInCatalog(database: D1Database, input: ActiveMatchCatalogInput): Promise<void> {
  await registerActiveMatch(createApplicationDatabase(database), input)
}

export async function recordCompletedMatchInCatalog(
  database: D1Database,
  input: { matchId: string; sourceLatestSeq: number; facts: StoredFact[]; endedAt: number },
): Promise<void> {
  await recordCompletedMatch(createApplicationDatabase(database), {
    matchId: input.matchId,
    sourceLatestSeq: input.sourceLatestSeq,
    protocolVersion: PROTOCOL_ARCHIVE_VERSION,
    rowsJson: JSON.stringify(prepareProtocolRowsForArchive(input.facts)),
    endedAt: input.endedAt,
  })
}
