import type { GameCreateStateArgs, GameCommandResult, GameProjectionKey } from './constants'

export abstract class GameplayRuntime {
  abstract createInitialState(args: GameCreateStateArgs): unknown
  abstract parseState(state: unknown): unknown
  abstract applyCommand(args: { state: unknown; commandType: string; command: unknown }): GameCommandResult
  abstract deriveProjection(args: { state: unknown; projection: GameProjectionKey }): unknown
}
