import { normalizeMatchId } from '@ks/competition'
import * as v from 'valibot'

import {
  deriveProtocolRows,
  PROTOCOL_ARCHIVE_VERSION,
  ProtocolArchiveRowsSchema,
  renderProtocolRows,
  type ProtocolRow,
} from '../../domain/protocol/reader'
import { getProtocolArchive } from '../../domain/protocol/repo'
import type { AppEnv } from './context'
import { listStoredFacts } from './match-room'

type SeatNames = { A: string; B: string }

const ProtocolArchiveRowsJsonSchema = v.pipe(v.string(), v.parseJson(), ProtocolArchiveRowsSchema)

export async function readProtocolHistory(
  env: AppEnv,
  rawMatchId: string,
  status: 'active' | 'finished',
  seatNames: SeatNames,
  timeZone: string,
): Promise<ProtocolRow[]> {
  const matchId = normalizeMatchId(rawMatchId)

  if (status === 'active') {
    const rows = deriveProtocolRows(await listStoredFacts(env, matchId), seatNames, timeZone)
    return rows.reverse()
  }

  const archive = await getProtocolArchive(env, matchId)

  if (!archive) throw new Response('Missing protocol archive', { status: 500 })
  // TODO: route old archive versions through normalizers before rendering once v2 exists.
  if (archive.protocolVersion !== PROTOCOL_ARCHIVE_VERSION)
    throw new Response('Unsupported protocol archive version', { status: 500 })

  const parsedRows = v.safeParse(ProtocolArchiveRowsJsonSchema, archive.rowsJson)
  if (!parsedRows.success) throw new Response('Failed to parse protocol archive from DB', { status: 500 })

  return renderProtocolRows(parsedRows.output, seatNames, timeZone)
}
