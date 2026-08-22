import type { MatchState } from '@ks/competition'
import {
  type CommandId,
  type ControlCommand,
  type MatchConfig,
  type MatchFact,
  newFactId,
  nowUnixEpochMilliseconds,
  opponentOf,
  SeatSchema,
} from '@ks/core'
import * as v from 'valibot'

import { type AnyActiveGameState, applyActiveGameCommand, deriveActiveGameSummary } from './active-game'

type RoomState = { matchState: MatchState; currentFrame: AnyActiveGameState | null }

const ConcedeFrameCommandSchema = v.object({ seat: SeatSchema })
const CommenceFrameCommandSchema = v.object({ seat: SeatSchema })

function applyGameCommandOrReject(
  active: AnyActiveGameState,
  commandType: string,
  command: ControlCommand['command'],
): ReturnType<typeof applyActiveGameCommand> | null {
  try {
    return applyActiveGameCommand(active, commandType, command)
  } catch (error) {
    if (error instanceof Error && error.message === 'Command not available') return null
    throw error
  }
}

export function legacyCommandFacts(room: RoomState, command: ControlCommand, commandId: CommandId): MatchFact[] | null {
  const config = room.matchState.config
  if (!config) throw new Error('Missing match config')

  const occurredAt = nowUnixEpochMilliseconds()
  const base = {
    matchId: config.matchId,
    occurredAt,
    causedByCommandId: commandId,
  }

  if (command.source === 'match' && command.commandType === 'frame.start') {
    const frameIndex = room.matchState.currentFrameIndex + 1
    return [
      {
        ...base,
        factId: newFactId(),
        type: 'frame.started',
        payload: {
          frameIndex,
          gameKey: config.gameKey,
          targetPointsBySeat: config.targets.frameTargetPointsBySeat,
          breakerSeat: breakerSeat(config, frameIndex),
          gameConfiguration: config.gameConfiguration,
        },
      },
    ]
  }

  if (command.source === 'match' && command.commandType === 'match.end') {
    const winnerSeat = matchWinner(config, room.matchState)
    if (!winnerSeat) return null
    return [{ ...base, factId: newFactId(), type: 'match.ended', payload: { winnerSeat } }]
  }

  if (room.currentFrame === null) return null
  const frame = room.matchState.frames.at(-1)
  if (!frame || frame.winnerSeat) return null

  if (command.source === 'match' && command.commandType === 'frame.commence') {
    const commence = v.safeParse(CommenceFrameCommandSchema, command.command)
    if (!commence.success || commence.output.seat !== frame.breakerSeat) return null
    const result = applyGameCommandOrReject(room.currentFrame, 'frame.commence', commence.output)
    if (!result) return null
    return [
      {
        ...base,
        factId: newFactId(),
        type: 'game.command',
        payload: {
          frameIndex: frame.frameIndex,
          gameKey: config.gameKey,
          commandType: 'frame.commence',
          command: commence.output,
          protocolEntries: result.protocolEntries,
        },
      },
    ]
  }

  if (command.source === 'game') {
    const result = applyGameCommandOrReject(room.currentFrame, command.commandType, command.command)
    if (!result) return null
    const game: MatchFact = {
      ...base,
      factId: newFactId(),
      type: 'game.command',
      payload: {
        frameIndex: frame.frameIndex,
        gameKey: config.gameKey,
        commandType: command.commandType,
        command: command.command,
        protocolEntries: result.protocolEntries,
      },
    }
    return result.outcome
      ? [
          game,
          {
            ...base,
            factId: newFactId(),
            type: 'frame.completed',
            payload: { frameIndex: frame.frameIndex, gameKey: config.gameKey, outcome: result.outcome },
          },
        ]
      : [game]
  }

  if (command.source === 'match' && command.commandType === 'frame.concede') {
    const concede = v.safeParse(ConcedeFrameCommandSchema, command.command)
    if (!concede.success) return null
    const projection = deriveActiveGameSummary(room.currentFrame)
    return [
      {
        ...base,
        factId: newFactId(),
        type: 'frame.completed',
        payload: {
          frameIndex: frame.frameIndex,
          gameKey: config.gameKey,
          outcome: { winnerSeat: opponentOf(concede.output.seat), score: projection.score, winReason: 'conceded' },
        },
      },
    ]
  }

  return null
}

function matchWinner(config: MatchConfig, matchState: MatchState): 'A' | 'B' | null {
  if (matchState.framesWonBySeat.A >= config.targets.matchTargetFrames) return 'A'
  if (matchState.framesWonBySeat.B >= config.targets.matchTargetFrames) return 'B'
  return null
}

function breakerSeat(config: MatchConfig, frameIndex: number): 'A' | 'B' {
  return frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
}
