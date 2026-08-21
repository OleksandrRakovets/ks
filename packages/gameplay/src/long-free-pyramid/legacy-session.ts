import { type ControlCommandPayload } from '@ks/core'

import type { GameCreateStateArgs } from '../constants'
import {
  acceptDecision,
  buildPreparedResult,
  createPreparedTransition,
  type GameCommandDecision,
  type GameplaySession,
  GameplaySessionDisposedError,
  InvalidPreparedTransitionError,
  isSessionOwnerActive,
  type PreparedGameCommandResult,
  type PreparedGameTransition,
  readPreparedTransition,
  registerSessionOwner,
  unregisterSessionOwner,
} from '../gameplay-session'
import { type LongFreePyramidFrameState } from './definitions'
import { LongFreePyramidGameplayRuntime } from './runtime'

type LegacyParsedCommand = {
  commandType: string
  command: ControlCommandPayload
}

class LongFreePyramidLegacyGameplaySession implements GameplaySession<'free-pyramid-long'> {
  readonly gameKey = 'free-pyramid-long' as const

  private readonly ownerId = Symbol('long-free-pyramid-legacy-gameplay-session')
  private readonly runtime = new LongFreePyramidGameplayRuntime()
  private stateValue: LongFreePyramidFrameState
  private revision = 0
  private disposed = false

  constructor(args: GameCreateStateArgs, restoredState?: LongFreePyramidFrameState) {
    registerSessionOwner(this.ownerId)
    this.stateValue = restoredState ?? this.runtime.createInitialState(args)
  }

  get state(): LongFreePyramidFrameState {
    this.assertActive()
    return this.stateValue
  }

  decide(commandType: string, command: ControlCommandPayload): GameCommandDecision<'free-pyramid-long'> {
    this.assertActive()

    const previousState = this.stateValue
    const candidateResultRaw = this.runtime.applyCommand({
      state: previousState,
      commandType,
      command,
    })
    const candidateResult = buildPreparedResult<'free-pyramid-long'>(
      candidateResultRaw.state,
      candidateResultRaw.protocolEntries,
      candidateResultRaw.outcome,
    )

    const prepared = createPreparedTransition<'free-pyramid-long'>({
      gameKey: this.gameKey,
      ownerId: this.ownerId,
      revision: this.revision,
      previousState,
      parsedEvent: { commandType, command } satisfies LegacyParsedCommand,
      candidateResult,
    })

    return acceptDecision<'free-pyramid-long'>(candidateResult, prepared)
  }

  applyCommitted(transitionToken: PreparedGameTransition<'free-pyramid-long'>): PreparedGameCommandResult<'free-pyramid-long'> {
    this.assertActive()

    const token = readPreparedTransition(transitionToken)
    if (!isSessionOwnerActive(token.ownerId)) {
      throw new InvalidPreparedTransitionError('Prepared transition owner is no longer active')
    }
    if (token.gameKey !== this.gameKey) throw new InvalidPreparedTransitionError('Prepared transition game key mismatch')
    if (token.ownerId !== this.ownerId) throw new InvalidPreparedTransitionError('Prepared transition owner mismatch')
    if (token.consumed) throw new InvalidPreparedTransitionError('Prepared transition was already consumed')

    if (JSON.stringify(this.stateValue) !== JSON.stringify(token.previousState)) {
      throw new InvalidPreparedTransitionError('Prepared transition previous state mismatch')
    }

    if (token.revision !== this.revision) throw new InvalidPreparedTransitionError('Prepared transition revision is stale')

    this.stateValue = token.candidateResult.state
    token.consumed = true
    this.revision += 1
    return token.candidateResult
  }

  deriveControl() {
    this.assertActive()
    return this.runtime.deriveControl(this.stateValue)
  }

  deriveSummary() {
    this.assertActive()
    return this.runtime.deriveSummary(this.stateValue)
  }

  deriveScoreboard() {
    this.assertActive()
    return this.runtime.deriveScoreboard(this.stateValue)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    unregisterSessionOwner(this.ownerId)
  }

  private assertActive(): void {
    if (this.disposed) throw new GameplaySessionDisposedError()
  }
}

export function createLongFreePyramidLegacyGameplaySession(
  args: GameCreateStateArgs,
  restoredState?: LongFreePyramidFrameState,
): GameplaySession<'free-pyramid-long'> {
  return new LongFreePyramidLegacyGameplaySession(args, restoredState)
}
