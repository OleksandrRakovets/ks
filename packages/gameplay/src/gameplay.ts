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
import { createGameplaySession, restoreGameplaySession } from './session-factory'
import { StrilaControlViewSchema } from './strila-v2/definitions'

export function parseGameKey(value: string): RegisteredGameKey {
  return v.parse(RegisteredGameKeySchema, value)
}

function createArgsFromState<K extends RegisteredGameKey>(gameKey: K, state: GameStateFor<K>): GameCreateStateArgs {
  switch (gameKey) {
    case 'strila-v2': {
      // SAFETY: The strila-v2 branch receives GameStateFor<'strila-v2'>.
      const strilaState = state as GameStateFor<'strila-v2'>
      return { targetPointsBySeat: strilaState.targetPoints, breakerSeat: 'A' }
    }
    case 'free-pyramid-long': {
      // SAFETY: The free-pyramid-long branch receives GameStateFor<'free-pyramid-long'>.
      const longState = state as GameStateFor<'free-pyramid-long'>
      return {
        targetPointsBySeat: longState.targetPointsBySeat,
        breakerSeat: 'A',
        gameConfiguration: { rackRollover: longState.rackRollover },
      }
    }
    case 'free-pyramid':
    case 'combined-pyramid':
    case 'combined-pyramid-old': {
      // SAFETY: These branches share PyramidFrameState as their canonical carrier.
      const pyramidState = state as GameStateFor<'free-pyramid'>
      return { targetPointsBySeat: pyramidState.targetPointsBySeat, breakerSeat: 'A' }
    }
  }
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
  const session = restoreGameplaySession(args.gameKey, args.state, createArgsFromState(args.gameKey, args.state))
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
  const session = restoreGameplaySession(gameKey, state, createArgsFromState(gameKey, state))
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
  let projection: ControlProjectionFor<RegisteredGameKey>
  switch (gameKey) {
    case 'strila-v2':
      projection = v.parse(StrilaControlViewSchema, input)
      break
    case 'free-pyramid':
      projection = v.parse(FreePyramidControlViewSchema, input)
      break
    case 'free-pyramid-long':
      projection = v.parse(LongFreePyramidControlViewSchema, input)
      break
    case 'combined-pyramid':
      projection = v.parse(CombinedPyramidControlViewSchema, input)
      break
    case 'combined-pyramid-old':
      projection = v.parse(CombinedPyramidOldControlViewSchema, input)
      break
  }
  if (projection.gameKey !== gameKey) throw new Error('Control projection game key does not match expected game')
  // SAFETY: The schema selected by gameKey parsed the projection and its literal gameKey was checked above.
  return projection as ControlProjectionFor<K>
}

export function deriveGameScoreboard<K extends RegisteredGameKey>(
  gameKey: K,
  state: GameStateFor<K>,
): ScoreboardProjectionFor<K> {
  const session = restoreGameplaySession(gameKey, state, createArgsFromState(gameKey, state))
  try {
    return session.deriveScoreboard()
  } finally {
    session.dispose()
  }
}

export function deriveGameSummary<K extends RegisteredGameKey>(gameKey: K, state: GameStateFor<K>): SummaryProjectionFor<K> {
  const session = restoreGameplaySession(gameKey, state, createArgsFromState(gameKey, state))
  try {
    return session.deriveSummary()
  } finally {
    session.dispose()
  }
}
