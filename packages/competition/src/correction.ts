import { CommandId, type MatchCommand, PositiveInteger, StrictStruct } from '@ks/core'
import { GameKey } from '@ks/gameplay/definitions'
import { Result, Schema } from 'effect'

import type { Match } from './match'
import type { ProtocolEntry, ProtocolEntryContent } from './protocol'

const CorrectionCommand = StrictStruct({
  type: Schema.Literal('command.correct'),
  targetSeq: PositiveInteger,
  targetCommandId: CommandId,
})

export type MatchCorrectionTarget = {
  readonly acceptedSeq: typeof PositiveInteger.Type
  readonly command: typeof MatchCommand.Type
  readonly protocolEntries: readonly (typeof ProtocolEntry.Type)[]
}

/** Compensates the current effective game command against its persisted pre-command checkpoint. */
export function correctMatch(
  matchBeforeTarget: Match,
  target: MatchCorrectionTarget,
  command: typeof MatchCommand.Type,
): ReturnType<Match['execute']> {
  const parsed = Schema.decodeUnknownResult(CorrectionCommand)(command.command)

  if (command.source !== 'match' || Result.isFailure(parsed))
    return {
      _tag: 'parse-failed',
      reason: { code: 'unsupported-match-command', commandType: 'command.correct' },
    }

  if (
    !isCorrectableCommand(target.command) ||
    target.acceptedSeq !== parsed.success.targetSeq ||
    target.command.commandId !== parsed.success.targetCommandId
  )
    return { _tag: 'rejected', reason: { code: 'correction-not-available' } }

  const state = matchBeforeTarget.state()
  const frame = state.frames.at(-1)
  const gameKey = Schema.decodeUnknownSync(GameKey)(state.gameKey)

  if (matchBeforeTarget.phase() !== 'frame-in-progress' || !frame)
    throw new Error('Persisted correction target is incompatible with its predecessor checkpoint')

  if (target.protocolEntries.length === 0)
    throw new Error('Persisted correction target has no Protocol entries')

  return {
    _tag: 'accepted',
    command,
    // A single Command may produce derived outcomes; compensate them latest-first while linking original positions.
    protocolEntryContents: target.protocolEntries
      .map((original): typeof ProtocolEntryContent.Type => ({
        gameKey,
        frameIndex: frame.frameIndex,
        source: original.source,
        entryType: 'command-corrected',
        seat: original.seat,
        scoreAfter: frame.pointsBySeat,
        body: {
          targetSeq: target.acceptedSeq,
          targetCommandId: target.command.commandId,
          targetEntryIndex: original.entryIndex,
        },
      }))
      .reverse(),
  }
}

export function isCorrectionCommand(command: typeof MatchCommand.Type): boolean {
  return command.source === 'match' && command.command.type === 'command.correct'
}

export function isCorrectableCommand(command: typeof MatchCommand.Type): boolean {
  return (
    command.source === 'game' &&
    command.command.type !== 'frame.commence' &&
    command.command.type !== 'frame.award'
  )
}
