import { type Match, restoreMatch } from '@ks/competition'
import { type AcceptedCommand, type MatchConfig, ProtocolEntry, type ProtocolEntryContent } from '@ks/core'
import * as v from 'valibot'

/** Disposable, atomically published semantic projection of authoritative Accepted Commands. */
export class ResidentMatch {
  #cache: ResidentState | null = null

  lookup(latestSeq: number): ResidentState | null {
    return this.#cache?.latestSeq === latestSeq ? this.#cache : null
  }

  restore(config: MatchConfig, latestSeq: number, commands: AcceptedCommand[]): ResidentState {
    try {
      const restored = restoreMatch(config, commands)

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
    contents: readonly ProtocolEntryContent[],
  ): ResidentState {
    return this.#publish(prior, acceptedCommand, contents, prior.match)
  }

  /** Replaces the semantic state but appends the Correction at the next Protocol cursor. */
  rewind(
    prior: ResidentState,
    acceptedCommand: AcceptedCommand,
    contents: readonly ProtocolEntryContent[],
    match: Match,
  ): ResidentState {
    return this.#publish(prior, acceptedCommand, contents, match)
  }

  clear(): void {
    this.#cache = null
  }

  #publish(
    prior: ResidentState,
    acceptedCommand: AcceptedCommand,
    contents: readonly ProtocolEntryContent[],
    match: Match,
  ): ResidentState {
    if (this.#cache !== prior || acceptedCommand.acceptedSeq !== prior.latestSeq + 1)
      throw new Error('MatchRoom resident cursor mismatch')
    const promoted = this.#promote(acceptedCommand, contents)

    const state = {
      latestSeq: acceptedCommand.acceptedSeq,
      match,
      protocolEntries: [...prior.protocolEntries, ...promoted],
    }

    this.#cache = state

    return state
  }

  #promote(command: AcceptedCommand, contents: readonly ProtocolEntryContent[]): ProtocolEntry[] {
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
  readonly match: Match
  readonly protocolEntries: readonly ProtocolEntry[]
}
