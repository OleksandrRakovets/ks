import type { Seat } from '@ks/domain'

import type { MatchState } from './state'

export type GameEffect =
  | {
      type: 'score.delta'
      seat: Seat
      delta: number
    }
  | {
      type: 'score.set'
      seat: Seat
      value: number
    }

export type GameDefinition = {
  reduceCommand: (state: MatchState, args: { commandType: string; command: unknown }) => { effects: GameEffect[] }
}

type ShotRecordedCommand = {
  seat: Seat
  points: number
}

function parseShotRecordedCommand(command: unknown): ShotRecordedCommand {
  if (typeof command !== 'object' || !command) {
    throw new Error('Invalid shot.recorded command payload')
  }

  const record = command as { seat?: unknown; points?: unknown }
  if ((record.seat !== 'A' && record.seat !== 'B') || typeof record.points !== 'number' || !Number.isInteger(record.points)) {
    throw new Error('Invalid shot.recorded command payload')
  }

  return {
    seat: record.seat,
    points: record.points,
  }
}

function currentFrame(state: MatchState): MatchState['frames'][number] {
  const frame = state.frames[state.frames.length - 1]
  if (!frame || frame.frameIndex !== state.currentFrameIndex || frame.winnerSeat) {
    throw new Error('No active frame for command')
  }
  return frame
}

function makePyramidDefinition(args: { allowNegative: boolean }): GameDefinition {
  return {
    reduceCommand: (state, input) => {
      if (input.commandType !== 'shot.recorded') {
        throw new Error(`Unsupported commandType: ${input.commandType}`)
      }

      const command = parseShotRecordedCommand(input.command)

      const frame = currentFrame(state)
      const current = frame.pointsBySeat[command.seat]
      const next = current + command.points

      return {
        effects: [
          {
            type: 'score.set',
            seat: command.seat,
            value: args.allowNegative ? next : Math.max(0, next),
          },
        ],
      }
    },
  }
}

const definitions: Record<string, GameDefinition> = {
  'free-pyramid': makePyramidDefinition({ allowNegative: false }),
  'combined-pyramid-old': makePyramidDefinition({ allowNegative: true }),
}

export function getGameDefinition(gameKey: string): GameDefinition {
  const definition = definitions[gameKey]
  if (!definition) {
    throw new Error(`Unsupported game key: ${gameKey}`)
  }
  return definition
}
