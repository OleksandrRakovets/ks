import { restoreSparringMatch, type SparringMatch } from '@ks/competition'
import {
  type AcceptedCommand,
  type MatchCommand,
  type NonEmptyProtocolEntryContents,
  ProtocolEntry,
  type ProtocolEntry as ProtocolEntryValue,
} from '@ks/core'
import * as v from 'valibot'

import { type ActiveMatchRecord, MatchStorage } from '../storage/match-storage'

/** Disposable, atomically published semantic projection of authoritative Accepted Commands. */
export class MatchResident {
  readonly #storage: MatchStorage
  #cache: ResidentEnvelope | null = null

  constructor(storage: MatchStorage) {
    this.#storage = storage
  }

  load(record: ActiveMatchRecord): ResidentEnvelope {
    if (this.#cache?.latestSeq === record.latestSeq) return this.#cache
    try {
      const restored = restoreSparringMatch(record.config, this.#storage.readAcceptedCommands(record))
      const protocolEntries = restored.accepted.flatMap(({ acceptedCommand, protocolEntryContents }) =>
        promote(acceptedCommand, protocolEntryContents),
      )
      const envelope = { latestSeq: record.latestSeq, match: restored.match, protocolEntries }
      this.#cache = envelope
      return envelope
    } catch (error) {
      this.clear()
      throw error
    }
  }

  executeAndCommit(record: ActiveMatchRecord, command: MatchCommand): ResidentExecutionResult {
    const prior = this.load(record)
    try {
      const result = prior.match.execute(command)
      if (result._tag !== 'accepted') return result
      const projection = prior.match.project()
      const finalState = projection.state.status === 'finished' ? projection.state : null
      const committed = this.#storage.commitAcceptedCommand({
        match: record,
        command: result.command,
        finalState,
      })
      if (committed.acceptedCommand.acceptedSeq !== prior.latestSeq + 1)
        throw new Error('MatchRoom resident cursor mismatch')
      const promoted = promote(committed.acceptedCommand, result.protocolEntryContents)
      this.#cache = {
        latestSeq: committed.acceptedCommand.acceptedSeq,
        match: prior.match,
        protocolEntries: [...prior.protocolEntries, ...promoted],
      }
      return { _tag: 'committed', committed }
    } catch (error) {
      this.clear()
      throw error
    }
  }

  clear(): void {
    this.#cache = null
  }
}

export type ResidentEnvelope = {
  readonly latestSeq: number
  readonly match: SparringMatch
  readonly protocolEntries: readonly ProtocolEntryValue[]
}

type ResidentExecutionResult =
  | Exclude<ReturnType<SparringMatch['execute']>, { _tag: 'accepted' }>
  | {
      readonly _tag: 'committed'
      readonly committed: ReturnType<MatchStorage['commitAcceptedCommand']>
    }

function promote(command: AcceptedCommand, contents: NonEmptyProtocolEntryContents): ProtocolEntryValue[] {
  return contents.map((content, entryIndex) =>
    v.parse(ProtocolEntry, {
      ...content,
      acceptedSeq: command.acceptedSeq,
      acceptedAt: command.acceptedAt,
      causedByCommandId: command.commandId,
      entryIndex,
    }),
  )
}
