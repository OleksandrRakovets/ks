import { restoreSparringMatch, type SparringMatch } from '@ks/competition'
import {
  type AcceptedCommand,
  type MatchConfig,
  type NonEmptyProtocolEntryContents,
  ProtocolEntry,
} from '@ks/core'
import * as v from 'valibot'

/** Disposable, atomically published semantic projection of authoritative Accepted Commands. */
export class ResidentMatch {
  #cache: ResidentState | null = null

  lookup(latestSeq: number): ResidentState | null {
    return this.#cache?.latestSeq === latestSeq ? this.#cache : null
  }

  restore(config: MatchConfig, latestSeq: number, commands: AcceptedCommand[]): ResidentState {
    try {
      const restored = restoreSparringMatch(config, commands)
      const protocolEntries = restored.accepted.flatMap(({ acceptedCommand, protocolEntryContents }) =>
        this.#promote(acceptedCommand, protocolEntryContents),
      )
      const state = { latestSeq, match: restored.match, protocolEntries }
      this.#cache = state
      return state
    } catch (error) {
      this.clear()
      throw error
    }
  }

  advance(
    prior: ResidentState,
    acceptedCommand: AcceptedCommand,
    contents: NonEmptyProtocolEntryContents,
  ): ResidentState {
    if (this.#cache !== prior || acceptedCommand.acceptedSeq !== prior.latestSeq + 1)
      throw new Error('MatchRoom resident cursor mismatch')
    const promoted = this.#promote(acceptedCommand, contents)
    const state = {
      latestSeq: acceptedCommand.acceptedSeq,
      match: prior.match,
      protocolEntries: [...prior.protocolEntries, ...promoted],
    }
    this.#cache = state
    return state
  }

  clear(): void {
    this.#cache = null
  }

  #promote(command: AcceptedCommand, contents: NonEmptyProtocolEntryContents): ProtocolEntry[] {
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
}

export type ResidentState = {
  readonly latestSeq: number
  readonly match: SparringMatch
  readonly protocolEntries: readonly ProtocolEntry[]
}
