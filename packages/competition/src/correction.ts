import { CommandId, type MatchCommand, PositiveInteger } from '@ks/core'
import { GameKey } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import type { Match } from './match'
import type { ProtocolEntry, ProtocolEntryContent } from './protocol'

const CorrectionCommand = v.pipe(
  v.strictObject({
    type: v.literal('command.correct'),
    targetSeq: PositiveInteger,
    targetCommandId: CommandId,
  }),
  v.readonly(),
)

export type MatchCorrectionTarget = {
  readonly acceptedSeq: PositiveInteger
  readonly command: MatchCommand
  readonly protocolEntries: readonly ProtocolEntry[]
}

/** Compensates the current effective game command against its persisted pre-command checkpoint. */
export function correctMatch(
  matchBeforeTarget: Match,
  target: MatchCorrectionTarget,
  command: MatchCommand,
): ReturnType<Match['execute']> {
  const parsed = v.safeParse(CorrectionCommand, command.command)

  if (command.source !== 'match' || !parsed.success)
    return {
      _tag: 'parse-failed',
      reason: { code: 'unsupported-match-command', commandType: 'command.correct' },
    }

  if (
    !isCorrectableCommand(target.command) ||
    target.acceptedSeq !== parsed.output.targetSeq ||
    target.command.commandId !== parsed.output.targetCommandId
  )
    return { _tag: 'rejected', reason: { code: 'correction-not-available' } }

  const state = matchBeforeTarget.state()
  const frame = state.frames.at(-1)
  const gameKey = v.parse(GameKey, state.gameKey)

  if (matchBeforeTarget.phase() !== 'frame-in-progress' || !frame)
    throw new Error('Persisted correction target is incompatible with its predecessor checkpoint')

  if (target.protocolEntries.length === 0)
    throw new Error('Persisted correction target has no Protocol entries')

  return {
    _tag: 'accepted',
    command,
    // A single Command may produce derived outcomes; compensate them latest-first while linking original positions.
    protocolEntryContents: target.protocolEntries
      .map((original): ProtocolEntryContent => ({
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

export function isCorrectionCommand(command: MatchCommand): boolean {
  return command.source === 'match' && command.command.type === 'command.correct'
}

export function isCorrectableCommand(command: MatchCommand): boolean {
  return (
    command.source === 'game' &&
    command.command.type !== 'frame.commence' &&
    command.command.type !== 'frame.award'
  )
}
