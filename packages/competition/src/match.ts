import {
  type AcceptedCommand,
  type Control,
  type FrameOutcome,
  type FrameState,
  type MatchCommand,
  type MatchConfig,
  type MatchState,
  opponentOf,
  type ProtocolEntryContent,
  Seat,
} from '@ks/core'
import { type GamePresentationFor, GameResult, RegisteredGameKey } from '@ks/gameplay/definitions'
import type { GameCommandFor } from '@ks/gameplay/definitions'
import {
  GameCommandRejection,
  GameplayCheckpoint,
  type GameplaySession,
  parseGameCommand,
  restoreGameplaySession,
} from '@ks/gameplay/server'
import { createGameplaySession } from '@ks/gameplay/server'
import * as v from 'valibot'

import {
  createInitialSnapshot,
  deriveLifecycleState,
  MatchMachineCheckpoint,
  type MatchSnapshot,
  restoreLifecycleSnapshot,
  sendLifecycleEvent,
} from './match-machine-internals'
import type { MatchStateFor } from './matches'

type MatchCommandParseFailure = {
  readonly code: 'unsupported-match-command'
  readonly commandType: string
}

export const MatchRejection = v.variant('code', [
  v.pipe(v.object({ code: v.literal('frame-already-active') }), v.readonly()),
  v.pipe(v.object({ code: v.literal('no-active-frame') }), v.readonly()),
  v.pipe(v.object({ code: v.literal('wrong-breaker'), expectedSeat: Seat }), v.readonly()),
  v.pipe(v.object({ code: v.literal('match-already-over') }), v.readonly()),
  v.pipe(v.object({ code: v.literal('game-command-rejected'), reason: GameCommandRejection }), v.readonly()),
])

export type MatchRejection = v.InferOutput<typeof MatchRejection>

type MatchCommandResult =
  | { readonly _tag: 'parse-failed'; readonly reason: MatchCommandParseFailure }
  | { readonly _tag: 'rejected'; readonly reason: MatchRejection }
  | {
      readonly _tag: 'accepted'
      readonly command: MatchCommand
      readonly protocolEntryContents: readonly ProtocolEntryContent[]
    }

type MatchRoomProjectionFor<K extends RegisteredGameKey> =
  | {
      readonly state: MatchStateFor<K>
      readonly game: GamePresentationFor<K>
      readonly controls: readonly Control[]
    }
  | {
      readonly state: MatchStateFor<K>
      readonly game: undefined
      readonly controls: readonly Control[]
    }

export type MatchRoomProjection = {
  [K in RegisteredGameKey]: MatchRoomProjectionFor<K>
}[RegisteredGameKey]

/** Complete executable aggregate state; storage cursor and Protocol are deliberately separate. */
export const MatchCheckpoint = v.object({
  lifecycle: MatchMachineCheckpoint,
  gameplay: v.nullable(GameplayCheckpoint),
  completedGameResult: v.nullable(GameResult),
})

export type MatchCheckpoint = v.InferOutput<typeof MatchCheckpoint>

export interface Match {
  exportCheckpoint(): MatchCheckpoint
  /**
   * Executes one untrusted control command and speculatively advances resident state on acceptance.
   * The caller must discard this resident if accepted content cannot subsequently be persisted.
   * @throws An unrecoverable execution defect; resident state may have partially advanced and must be discarded.
   */
  execute(command: MatchCommand): MatchCommandResult

  /** Returns current semantic state and controls without storage cursor metadata. */
  project(): MatchRoomProjection

  /** Game-owned result, retained when gameplay is discarded after the frame ends. */
  gameResult(): GameResult | null
}

export class MatchHistoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatchHistoryError'
  }
}

type CorrelatedGameplay<K extends RegisteredGameKey> = {
  readonly key: K
  readonly session: GameplaySession<K>
}

type AnyCorrelatedGameplay = { [K in RegisteredGameKey]: CorrelatedGameplay<K> }[RegisteredGameKey]

const MatchLifecycleCommand = v.variant('type', [
  v.pipe(v.strictObject({ type: v.literal('frame.prepare') }), v.readonly()),
  v.pipe(v.strictObject({ type: v.literal('frame.commence'), seat: Seat }), v.readonly()),
  v.pipe(v.strictObject({ type: v.literal('frame.concede'), seat: Seat }), v.readonly()),
])

type MatchLifecycleCommand = v.InferOutput<typeof MatchLifecycleCommand>

function gameKeyOf(value: string): RegisteredGameKey {
  return v.parse(RegisteredGameKey, value)
}

function wrapGameplay<K extends RegisteredGameKey>(
  key: K,
  session: GameplaySession<K>,
): CorrelatedGameplay<K> {
  return { key, session }
}

function createGameplay(key: RegisteredGameKey, config: MatchConfig): AnyCorrelatedGameplay {
  const targetPointsBySeat = config.targets.frameTargetPointsBySeat

  switch (key) {
    case 'strila-v2':
      return wrapGameplay(key, createGameplaySession(key, { targetPointsBySeat }))
    case 'free-pyramid':
      return wrapGameplay(key, createGameplaySession(key, { targetPointsBySeat }))
    case 'free-pyramid-long':
      const rackRollover = config.gameConfiguration?.rackRollover

      if (rackRollover !== 14 && rackRollover !== 15)
        throw new Error('Long free pyramid requires rack rollover')

      return wrapGameplay(key, createGameplaySession(key, { targetPointsBySeat, rackRollover }))
    case 'combined-pyramid':
      return wrapGameplay(key, createGameplaySession(key, { targetPointsBySeat }))
    case 'combined-pyramid-old':
      return wrapGameplay(key, createGameplaySession(key, { targetPointsBySeat }))
  }

  throw new Error('Unsupported registered game')
}

function requireGameplay<K extends RegisteredGameKey>(
  key: K,
  gameplay: AnyCorrelatedGameplay | null,
): CorrelatedGameplay<K> {
  if (!gameplay || gameplay.key !== key) throw new Error(`Missing gameplay session for ${key}`)

  // SAFETY: the runtime key check correlates the discriminated gameplay session with K.
  return gameplay as CorrelatedGameplay<K>
}

function concedeControl(seat: Seat): Control {
  return { source: 'match', type: 'frame.concede', fixedInput: {}, seat, prominence: 'tertiary' }
}

class ResidentMatch implements Match {
  private snapshot: MatchSnapshot
  private gameplay: AnyCorrelatedGameplay | null
  #completedGameResult: GameResult | null = null

  constructor(
    snapshot: MatchSnapshot,
    gameplay: AnyCorrelatedGameplay | null,
    completedGameResult: GameResult | null = null,
  ) {
    this.snapshot = snapshot
    this.gameplay = gameplay
    this.#completedGameResult = completedGameResult
  }

  exportCheckpoint(): MatchCheckpoint {
    const gameplay = this.gameplay

    return {
      lifecycle: {
        value: this.snapshot.value,
        context: this.snapshot.context,
      },
      gameplay: gameplay
        ? v.parse(GameplayCheckpoint, { gameKey: gameplay.key, state: gameplay.session.exportCheckpoint() })
        : null,
      completedGameResult: this.#completedGameResult,
    }
  }

  gameResult(): GameResult | null {
    return this.gameplay?.session.deriveResult?.() ?? this.#completedGameResult
  }

  execute(command: MatchCommand): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)
    const discriminator = v.safeParse(v.object({ type: v.string() }), command.command)
    const commandType = discriminator.success ? discriminator.output.type : 'unknown'

    const parseFailed = (): MatchCommandResult => ({
      _tag: 'parse-failed',
      reason: { code: 'unsupported-match-command', commandType },
    })

    if (command.source === 'match') {
      const parsed = v.safeParse(MatchLifecycleCommand, command.command)

      return parsed.success ? this.applyMatchCommand(parsed.output, command) : parseFailed()
    }

    if (['frame.prepare', 'frame.commence', 'frame.concede'].includes(commandType)) return parseFailed()
    const gameKey = gameKeyOf(lifecycle.config.gameKey)
    const parsed = parseGameCommand(gameKey, command.command)

    if (parsed._tag === 'game-command-parse-failure') return parseFailed()

    return this.applyGameCommand(gameKey, parsed.command, command)
  }

  project(): MatchRoomProjection {
    const lifecycle = deriveLifecycleState(this.snapshot)

    const frames: FrameState[] = lifecycle.completedFrames.map((frame) => ({
      frameIndex: frame.frameIndex,
      pointsBySeat: frame.outcome.score,
      breakerSeat: frame.breakerSeat,
      winnerSeat: frame.outcome.winnerSeat,
    }))

    if (lifecycle.phase === 'frame-in-progress') {
      const gameplay = requireGameplay(gameKeyOf(lifecycle.config.gameKey), this.gameplay)
      frames.push({
        frameIndex: lifecycle.activeFrame.frameIndex,
        breakerSeat: lifecycle.activeFrame.breakerSeat,
        pointsBySeat: gameplay.session.getScore(),
      })
    }

    const currentFrameIndex =
      lifecycle.phase === 'frame-in-progress'
        ? lifecycle.activeFrame.frameIndex
        : (lifecycle.completedFrames.at(-1)?.frameIndex ?? 0)

    const stateWithoutConfiguration: MatchState = {
      matchId: lifecycle.config.matchId,
      gameKey: lifecycle.config.gameKey,
      targets: lifecycle.config.targets,
      status: lifecycle.phase === 'finished' ? 'finished' : 'active',
      currentFrameIndex,
      framesWonBySeat: lifecycle.framesWonBySeat,
      frames,
    }

    const state: MatchState =
      lifecycle.config.gameConfiguration === undefined
        ? stateWithoutConfiguration
        : { ...stateWithoutConfiguration, gameConfiguration: lifecycle.config.gameConfiguration }

    const matchControls: Control[] = []

    if (lifecycle.phase === 'between-frames')
      matchControls.push({
        source: 'match',
        type: 'frame.prepare',
        fixedInput: {},
        prominence: 'secondary',
      })

    if (lifecycle.phase !== 'frame-in-progress') {
      // SAFETY: state retains the registered game key parsed from this lifecycle; no gameplay exists in this phase.
      return { state, game: undefined, controls: matchControls } as MatchRoomProjection
    }

    const gameplay = requireGameplay(gameKeyOf(lifecycle.config.gameKey), this.gameplay)

    if (gameplay.session.canCommence(lifecycle.activeFrame.breakerSeat)) {
      const seat = lifecycle.activeFrame.breakerSeat
      matchControls.push({
        source: 'match',
        type: 'frame.commence',
        fixedInput: {},
        seat,
        prominence: 'primary',
      })
    } else if (gameplay.session.canConcede()) {
      matchControls.push(concedeControl('A'), concedeControl('B'))
    }

    const gameControlProjection = gameplay.session.deriveControls()
    // Raw order is match-first, not global display order. Stable grouping preserves match-before-game per bucket.
    const controls = [...matchControls, ...gameControlProjection.controls]

    // SAFETY: requireGameplay's runtime key check correlates game with the state's registered game key.
    return {
      state,
      game: gameControlProjection.game,
      controls,
    } as MatchRoomProjection
  }

  private applyMatchCommand(
    command: MatchLifecycleCommand,
    acceptedCommand: MatchCommand,
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)

    if (lifecycle.phase === 'finished') return { _tag: 'rejected', reason: { code: 'match-already-over' } }

    if (command.type === 'frame.prepare') {
      if (lifecycle.phase !== 'between-frames')
        return { _tag: 'rejected', reason: { code: 'frame-already-active' } }
      const frameIndex = lifecycle.nextFrameIndex

      const breakerSeat =
        frameIndex % 2 === 1
          ? lifecycle.config.firstBreakerSeat
          : opponentOf(lifecycle.config.firstBreakerSeat)

      this.snapshot = sendLifecycleEvent(this.snapshot, { type: 'frame.prepared', frameIndex, breakerSeat })
      this.gameplay = createGameplay(gameKeyOf(lifecycle.config.gameKey), lifecycle.config)

      return {
        _tag: 'accepted',
        command: acceptedCommand,
        protocolEntryContents: [
          {
            gameKey: lifecycle.config.gameKey,
            frameIndex,
            source: 'system',
            entryType: 'frame-prepared',
            seat: breakerSeat,
            body: {
              targetPointsBySeat: lifecycle.config.targets.frameTargetPointsBySeat,
              gameConfiguration: lifecycle.config.gameConfiguration,
            },
          },
        ],
      }
    }

    if (lifecycle.phase !== 'frame-in-progress' || !this.gameplay)
      return { _tag: 'rejected', reason: { code: 'no-active-frame' } }

    if (command.type === 'frame.concede') {
      if (!this.gameplay.session.canConcede())
        return {
          _tag: 'rejected',
          reason: { code: 'game-command-rejected', reason: { code: 'command-not-available' } },
        }

      const outcome: FrameOutcome = {
        winnerSeat: opponentOf(command.seat),
        score: this.gameplay.session.getScore(),
        winReason: 'conceded',
      }

      return this.completeFrame(outcome, acceptedCommand, [
        {
          gameKey: lifecycle.config.gameKey,
          frameIndex: lifecycle.activeFrame.frameIndex,
          source: 'player',
          entryType: 'frame-conceded',
          seat: command.seat,
          scoreAfter: outcome.score,
          body: {},
        },
      ])
    }

    if (command.seat !== lifecycle.activeFrame.breakerSeat) {
      return {
        _tag: 'rejected',
        reason: { code: 'wrong-breaker', expectedSeat: lifecycle.activeFrame.breakerSeat },
      }
    }

    const gameKey = gameKeyOf(lifecycle.config.gameKey)

    return this.applyGameCommand(gameKey, command, acceptedCommand)
  }

  private applyGameCommand<K extends RegisteredGameKey>(
    gameKey: K,
    gameCommand: GameCommandFor<K>,
    acceptedCommand: MatchCommand,
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)

    if (lifecycle.phase === 'finished') return { _tag: 'rejected', reason: { code: 'match-already-over' } }

    if (lifecycle.phase !== 'frame-in-progress' || !this.gameplay)
      return { _tag: 'rejected', reason: { code: 'no-active-frame' } }
    const gameplay = requireGameplay(gameKey, this.gameplay)
    const execution = gameplay.session.execute(gameCommand)

    if (execution._tag === 'rejected')
      return { _tag: 'rejected', reason: { code: 'game-command-rejected', reason: execution.reason } }

    const protocolEntryContents = execution.gameProtocolEntries.map((entry) => ({
      ...entry,
      frameIndex: lifecycle.activeFrame.frameIndex,
    }))

    return execution.outcome
      ? this.completeFrame(execution.outcome, acceptedCommand, protocolEntryContents)
      : { _tag: 'accepted', command: acceptedCommand, protocolEntryContents }
  }

  private completeFrame(
    outcome: FrameOutcome,
    acceptedCommand: MatchCommand,
    protocolEntryContents: ProtocolEntryContent[],
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)

    if (lifecycle.phase !== 'frame-in-progress') throw new Error('Cannot complete inactive frame')
    protocolEntryContents.push({
      gameKey: lifecycle.config.gameKey,
      frameIndex: lifecycle.activeFrame.frameIndex,
      source: 'system',
      entryType: 'frame-awarded',
      seat: outcome.winnerSeat,
      scoreAfter: outcome.score,
      body: { winReason: outcome.winReason },
    })
    this.snapshot = sendLifecycleEvent(this.snapshot, {
      type: 'frame.completed',
      frameIndex: lifecycle.activeFrame.frameIndex,
      outcome,
    })
    const resulting = deriveLifecycleState(this.snapshot)

    if (resulting.phase === 'finished')
      protocolEntryContents.push({
        gameKey: lifecycle.config.gameKey,
        frameIndex: lifecycle.activeFrame.frameIndex,
        source: 'system',
        entryType: 'match-ended',
        seat: resulting.winnerSeat,
        body: {},
      })
    this.#completedGameResult = this.gameplay?.session.deriveResult?.() ?? null
    this.gameplay = null

    return { _tag: 'accepted', command: acceptedCommand, protocolEntryContents }
  }

  restore(command: AcceptedCommand): readonly ProtocolEntryContent[] {
    const result = this.execute(command)

    if (result._tag === 'parse-failed') throw new MatchHistoryError('Malformed stored Match Command')

    if (result._tag !== 'accepted') throw new MatchHistoryError('Stored accepted Command is not executable')

    return result.protocolEntryContents
  }
}

/**
 * Drafts semantic creation content without constructing resident state.
 * @throws A Valibot parse error when the configuration uses an unregistered game key.
 */
export function createMatch(config: MatchConfig): Match {
  return createResidentMatch(config)
}

/** Validates persisted state and restores one local executable aggregate without replay. */
export function restoreMatchCheckpoint(input: MatchCheckpoint): Match {
  const checkpoint = v.parse(MatchCheckpoint, input)
  const lifecycle = restoreLifecycleSnapshot(checkpoint.lifecycle)
  const config = checkpoint.lifecycle.context.config
  const phase = checkpoint.lifecycle.value
  const gameplay = checkpoint.gameplay

  if (
    (phase === 'frame-in-progress') !== (gameplay !== null) ||
    (gameplay !== null && gameplay.gameKey !== config.gameKey) ||
    (gameplay !== null &&
      (gameplay.state.context.targetPoints.A !== config.targets.frameTargetPointsBySeat.A ||
        gameplay.state.context.targetPoints.B !== config.targets.frameTargetPointsBySeat.B)) ||
    (gameplay?.gameKey === 'free-pyramid-long' &&
      gameplay.state.context.rackRollover !== config.gameConfiguration?.rackRollover) ||
    (checkpoint.completedGameResult !== null && config.gameKey !== 'free-pyramid-long') ||
    (checkpoint.completedGameResult === null &&
      config.gameKey === 'free-pyramid-long' &&
      checkpoint.lifecycle.context.completedFrames.length > 0)
  )
    throw new Error('Inconsistent match checkpoint')

  // SAFETY: restoration dispatches by the validated key, preserving session/key correlation.
  const correlated =
    gameplay && ({ key: gameplay.gameKey, session: restoreGameplaySession(gameplay) } as AnyCorrelatedGameplay)

  return new ResidentMatch(lifecycle, correlated, checkpoint.completedGameResult)
}

function createResidentMatch(config: MatchConfig): ResidentMatch {
  gameKeyOf(config.gameKey)

  return new ResidentMatch(createInitialSnapshot(config), null)
}

/**
 * Restores disposable resident state from envelope-validated semantic command batches.
 * @throws MatchHistoryError when accepted history is impossible or incompatible with current rules.
 */
export function restoreMatch(config: MatchConfig, history: readonly AcceptedCommand[]): RestoredMatch {
  const resident = createResidentMatch(config)

  try {
    const accepted = history.map((acceptedCommand) => ({
      acceptedCommand,
      protocolEntryContents: resident.restore(acceptedCommand),
    }))

    return { match: resident, accepted }
  } catch (error) {
    if (error instanceof MatchHistoryError) throw error
    throw new MatchHistoryError(error instanceof Error ? error.message : 'History restoration failed')
  }
}

export type RestoredMatch = {
  readonly match: Match
  readonly accepted: readonly {
    readonly acceptedCommand: AcceptedCommand
    readonly protocolEntryContents: readonly ProtocolEntryContent[]
  }[]
}
