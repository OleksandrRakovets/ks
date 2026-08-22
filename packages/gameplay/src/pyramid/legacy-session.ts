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
import type { ControlProjectionFor, GameStateFor, ScoreboardProjectionFor, SummaryProjectionFor } from '../registry'
import { type PyramidFrameState, type PyramidGameKey, type PyramidRuntimeConfig } from './definitions'
import { PyramidGameplayRuntime } from './runtime'

type LegacyParsedCommand = {
  commandType: string
  command: ControlCommandPayload
}

class PyramidLegacyGameplaySession<K extends PyramidGameKey> implements GameplaySession<K> {
  readonly gameKey: K

  private readonly ownerId = Symbol('pyramid-legacy-gameplay-session')
  private readonly runtime: PyramidGameplayRuntime<K>
  private stateValue: PyramidFrameState
  private revision = 0
  private disposed = false

  constructor(config: PyramidRuntimeConfig<K>, args: GameCreateStateArgs, restoredState?: PyramidFrameState) {
    registerSessionOwner(this.ownerId)
    this.runtime = new PyramidGameplayRuntime(config)
    this.gameKey = config.gameKey
    this.stateValue = restoredState ?? this.runtime.createInitialState(args)
  }

  get state(): GameStateFor<K> {
    this.assertActive()
    return this.stateValue
  }

  decide(commandType: string, command: ControlCommandPayload): GameCommandDecision<K> {
    this.assertActive()

    const previousState = this.stateValue
    const candidateResultRaw = this.runtime.applyCommand({
      state: previousState,
      commandType,
      command,
    })
    const candidateResult = buildPreparedResult<K>(
      candidateResultRaw.state,
      candidateResultRaw.protocolEntries,
      candidateResultRaw.outcome,
    )

    const prepared = createPreparedTransition<K>({
      gameKey: this.gameKey,
      ownerId: this.ownerId,
      revision: this.revision,
      previousState,
      parsedEvent: { commandType, command } satisfies LegacyParsedCommand,
      candidateResult,
    })

    return acceptDecision<K>(candidateResult, prepared)
  }

  applyCommitted(transitionToken: PreparedGameTransition<K>): PreparedGameCommandResult<K> {
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

  deriveControl(): ControlProjectionFor<K> {
    this.assertActive()
    const projection = this.runtime.deriveControl(this.stateValue)
    // SAFETY: GameContracts maps every PyramidGameKey to PyramidControlViewFor<K>.
    return projection as ControlProjectionFor<K>
  }

  deriveSummary(): SummaryProjectionFor<K> {
    this.assertActive()
    const projection = this.runtime.deriveSummary(this.stateValue)
    // SAFETY: GameContracts maps every PyramidGameKey to PyramidSummaryViewFor<K>.
    return projection as SummaryProjectionFor<K>
  }

  deriveScoreboard(): ScoreboardProjectionFor<K> {
    this.assertActive()
    const projection = this.runtime.deriveScoreboard(this.stateValue)
    // SAFETY: GameContracts maps every PyramidGameKey to PyramidScoreboardViewFor<K>.
    return projection as ScoreboardProjectionFor<K>
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

export function createPyramidLegacyGameplaySession<K extends PyramidGameKey>(
  config: PyramidRuntimeConfig<K>,
  args: GameCreateStateArgs,
  restoredState?: PyramidFrameState,
): GameplaySession<K> {
  return new PyramidLegacyGameplaySession(config, args, restoredState)
}
