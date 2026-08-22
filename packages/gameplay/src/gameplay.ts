import { type ControlCommandPayload } from '@ks/core'
import * as v from 'valibot'

import { type GameCommandResult, type GameControlProjectionInput, type GameCreateStateArgs } from './constants'
import { LongFreePyramidControlViewSchema } from './long-free-pyramid/definitions'
import {
  CombinedPyramidControlViewSchema,
  CombinedPyramidOldControlViewSchema,
  FreePyramidControlViewSchema,
} from './pyramid/definitions'
import {
  type ControlProjectionFor,
  type GameStateFor,
  type RegisteredGameKey,
  RegisteredGameKeySchema,
  type ScoreboardProjectionFor,
  type SummaryProjectionFor,
} from './registry'
import { createGameplaySession, createGameplaySessionArgsFromState, restoreGameplaySession } from './session-factory'
import { StrilaControlViewSchema } from './strila-v2/definitions'

export function parseGameKey(value: string): RegisteredGameKey {
  return v.parse(RegisteredGameKeySchema, value)
}

type GameControlParser<K extends RegisteredGameKey> = (input: GameControlProjectionInput) => ControlProjectionFor<K>

type GameControlParsers = {
  [K in RegisteredGameKey]: GameControlParser<K>
}

const gameControlParsers: GameControlParsers = {
  'strila-v2': (input) => v.parse(StrilaControlViewSchema, input),
  'free-pyramid': (input) => v.parse(FreePyramidControlViewSchema, input),
  'free-pyramid-long': (input) => v.parse(LongFreePyramidControlViewSchema, input),
  'combined-pyramid': (input) => v.parse(CombinedPyramidControlViewSchema, input),
  'combined-pyramid-old': (input) => v.parse(CombinedPyramidOldControlViewSchema, input),
}

export function createInitialGameState<K extends RegisteredGameKey>(gameKey: K, args: GameCreateStateArgs): GameStateFor<K> {
  const session = createGameplaySession(gameKey, args)
  const state = session.state
  session.dispose()
  return state
}

export function applyGameCommand<K extends RegisteredGameKey>(args: {
  gameKey: K
  state: GameStateFor<K>
  commandType: string
  command: ControlCommandPayload
}): GameCommandResult<GameStateFor<K>> {
  const session = restoreGameplaySession(args.gameKey, args.state, createGameplaySessionArgsFromState(args.gameKey, args.state))
  try {
    const decision = session.decide(args.commandType, args.command)
    if (decision._tag === 'rejected') {
      throw new Error('Command not available')
    }
    const result = session.applyCommitted(decision.transition)
    return {
      state: result.state,
      outcome: result.outcome,
      protocolEntries: [...result.protocolEntries],
    }
  } finally {
    session.dispose()
  }
}

export function deriveGameControl<K extends RegisteredGameKey>(gameKey: K, state: GameStateFor<K>): ControlProjectionFor<K> {
  const session = restoreGameplaySession(gameKey, state, createGameplaySessionArgsFromState(gameKey, state))
  try {
    return session.deriveControl()
  } finally {
    session.dispose()
  }
}

export function parseGameControl<K extends RegisteredGameKey>(
  gameKey: K,
  input: GameControlProjectionInput,
): ControlProjectionFor<K> {
  return gameControlParsers[gameKey](input)
}

export function deriveGameScoreboard<K extends RegisteredGameKey>(
  gameKey: K,
  state: GameStateFor<K>,
): ScoreboardProjectionFor<K> {
  const session = restoreGameplaySession(gameKey, state, createGameplaySessionArgsFromState(gameKey, state))
  try {
    return session.deriveScoreboard()
  } finally {
    session.dispose()
  }
}

export function deriveGameSummary<K extends RegisteredGameKey>(gameKey: K, state: GameStateFor<K>): SummaryProjectionFor<K> {
  const session = restoreGameplaySession(gameKey, state, createGameplaySessionArgsFromState(gameKey, state))
  try {
    return session.deriveSummary()
  } finally {
    session.dispose()
  }
}
