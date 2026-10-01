import { type Control, type FrameOutcome, type MatchCommand, opponentOf, Seat } from '@ks/core'
import { GameKey, type GamePresentationFor, GameResult } from '@ks/gameplay/definitions'
import {
  GameCommandRejection,
  GameplayCheckpoint,
  type GameplaySession,
  parseGameCommand,
  restoreGameplaySession,
} from '@ks/gameplay/server'
import { createGameplaySession } from '@ks/gameplay/server'
import * as v from 'valibot'

import type { FrameState, MatchConfig, MatchState, MatchStateFor } from './definitions'
import {
  createInitialSnapshot,
  deriveLifecycleState,
  MatchMachineCheckpoint,
  type MatchPhase,
  type MatchSnapshot,
  restoreLifecycleSnapshot,
  sendLifecycleEvent,
} from './match-machine-internals'
import type { ProtocolEntryContent } from './protocol'

/** Complete executable aggregate state; storage cursor and Protocol are deliberately separate. */
export const MatchCheckpoint = v.object({
  lifecycle: MatchMachineCheckpoint,
  gameplay: v.nullable(GameplayCheckpoint),
  completedGameResult: v.nullable(GameResult),
})

export type MatchCheckpoint = v.InferOutput<typeof MatchCheckpoint>

type MatchCommandParseFailure = {
  readonly code: 'unsupported-match-command'
  readonly commandType: string
}

export const MatchRejection = v.variant('code', [
  v.pipe(v.object({ code: v.literal('no-active-frame') }), v.readonly()),
  v.pipe(v.object({ code: v.literal('wrong-breaker'), expectedSeat: Seat }), v.readonly()),
  v.pipe(v.object({ code: v.literal('match-already-over') }), v.readonly()),
  v.pipe(v.object({ code: v.literal('game-command-rejected'), reason: GameCommandRejection }), v.readonly()),
  v.pipe(v.object({ code: v.literal('correction-not-available') }), v.readonly()),
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

export type { Match }

type CorrelatedGameplay<K extends GameKey> = {
  readonly key: K
  readonly session: GameplaySession<K>
}

type AnyCorrelatedGameplay = { [K in GameKey]: CorrelatedGameplay<K> }[GameKey]

type MatchControlProjection =
  | {
      readonly controlPhase: 'finished'
      readonly state: Extract<MatchState, { status: 'finished' }>
      readonly game: undefined
      readonly controls: readonly Control[]
    }
  | {
      readonly controlPhase: 'between-frames'
      readonly state: Extract<MatchState, { status: 'active' }>
      readonly game: undefined
      readonly controls: readonly Control[]
    }
  | {
      [K in GameKey]: {
        readonly controlPhase: 'frame-active'
        readonly state: MatchStateFor<K> & { readonly status: 'active' }
        readonly game: GamePresentationFor<K>
        readonly controls: readonly Control[]
      }
    }[GameKey]

const MatchLifecycleCommand = v.variant('type', [
  v.pipe(v.strictObject({ type: v.literal('frame.commence'), seat: Seat }), v.readonly()),
  v.pipe(v.strictObject({ type: v.literal('frame.concede'), seat: Seat }), v.readonly()),
])

type MatchLifecycleCommand = v.InferOutput<typeof MatchLifecycleCommand>

/** Executable Match aggregate; construct through createMatch or restoreMatchCheckpoint. */
class Match {
  #snapshot: MatchSnapshot
  #gameplay: AnyCorrelatedGameplay | null
  #completedGameResult: GameResult | null = null

  constructor(
    snapshot: MatchSnapshot,
    gameplay: AnyCorrelatedGameplay | null,
    completedGameResult: GameResult | null = null,
  ) {
    this.#snapshot = snapshot
    this.#gameplay = gameplay
    this.#completedGameResult = completedGameResult
  }

  /**
   * Executes one untrusted control command and speculatively advances resident state on acceptance.
   * The caller must discard this resident if accepted content cannot subsequently be persisted.
   * @throws An unrecoverable execution defect; resident state may have partially advanced and must be discarded.
   */
  execute(command: MatchCommand): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.#snapshot)
    const discriminator = v.safeParse(v.object({ type: v.string() }), command.command)
    const commandType = discriminator.success ? discriminator.output.type : 'unknown'

    const parseFailed = (): MatchCommandResult => ({
      _tag: 'parse-failed',
      reason: { code: 'unsupported-match-command', commandType },
    })

    if (command.source === 'match') {
      const parsed = v.safeParse(MatchLifecycleCommand, command.command)

      return parsed.success ? this.#applyMatchCommand(parsed.output, command) : parseFailed()
    }

    if (['frame.commence', 'frame.concede'].includes(commandType)) return parseFailed()
    const gameKey = gameKeyOf(lifecycle.config.gameKey)

    return this.#applyGameCommand(gameKey, command.command, command, commandType)
  }

  /** Returns the current competition lifecycle phase. */
  phase(): MatchPhase {
    return deriveLifecycleState(this.#snapshot).phase
  }

  /** Returns current semantic Match state, including active gameplay score. */
  state(): MatchState {
    const lifecycle = deriveLifecycleState(this.#snapshot)

    const frames: FrameState[] = lifecycle.completedFrames.map((frame) => ({
      frameIndex: frame.frameIndex,
      pointsBySeat: frame.outcome.score,
      breakerSeat: frame.breakerSeat,
      winnerSeat: frame.outcome.winnerSeat,
    }))

    if (lifecycle.phase === 'frame-in-progress') {
      const gameplay = requireGameplay(gameKeyOf(lifecycle.config.gameKey), this.#gameplay)
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

    const stateFields = {
      matchId: lifecycle.config.matchId,
      gameKey: lifecycle.config.gameKey,
      targets: lifecycle.config.targets,
      currentFrameIndex,
      framesWonBySeat: lifecycle.framesWonBySeat,
      frames,
    }

    const stateWithoutConfiguration: MatchState =
      lifecycle.phase === 'finished'
        ? { ...stateFields, status: 'finished' }
        : { ...stateFields, status: 'active' }

    return lifecycle.config.gameConfiguration === undefined
      ? stateWithoutConfiguration
      : { ...stateWithoutConfiguration, gameConfiguration: lifecycle.config.gameConfiguration }
  }

  /** Derives one coherent state, game presentation and match-first control list from this resident. */
  controlProjection(): MatchControlProjection {
    const lifecycle = deriveLifecycleState(this.#snapshot)
    const state = this.state()

    if (state.status === 'finished') return { controlPhase: 'finished', state, game: undefined, controls: [] }

    const matchControls: Control[] = []

    if (lifecycle.phase !== 'frame-in-progress') {
      return { controlPhase: 'between-frames', state, game: undefined, controls: matchControls }
    }

    const gameplay = requireGameplay(gameKeyOf(lifecycle.config.gameKey), this.#gameplay)

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
    // SAFETY: requireGameplay correlates this resident's config key with the session; state and game are read
    // without intervening mutation. TypeScript cannot express that correlation between the two query results.
    return {
      controlPhase: 'frame-active',
      state,
      game: gameControlProjection.game,
      controls: [...matchControls, ...gameControlProjection.controls],
    } as Extract<MatchControlProjection, { controlPhase: 'frame-active' }>
  }

  /** Game-owned result, retained when gameplay is discarded after the frame ends. */
  gameResult(): GameResult | null {
    return this.#gameplay?.session.deriveResult?.() ?? this.#completedGameResult
  }

  exportCheckpoint(): MatchCheckpoint {
    const gameplay = this.#gameplay

    return {
      lifecycle: {
        value: this.#snapshot.value,
        context: this.#snapshot.context,
      },
      gameplay: gameplay ? exportGameplayCheckpoint(gameplay) : null,
      completedGameResult: this.#completedGameResult,
    }
  }

  #applyMatchCommand(command: MatchLifecycleCommand, acceptedCommand: MatchCommand): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.#snapshot)
    const gameKey = gameKeyOf(lifecycle.config.gameKey)

    if (lifecycle.phase === 'finished') return { _tag: 'rejected', reason: { code: 'match-already-over' } }

    if (lifecycle.phase !== 'frame-in-progress' || !this.#gameplay)
      return { _tag: 'rejected', reason: { code: 'no-active-frame' } }

    if (command.type === 'frame.concede') {
      if (!this.#gameplay.session.canConcede())
        return {
          _tag: 'rejected',
          reason: { code: 'game-command-rejected', reason: { code: 'command-not-available' } },
        }

      const outcome: FrameOutcome = {
        winnerSeat: opponentOf(command.seat),
        score: this.#gameplay.session.getScore(),
        winReason: 'conceded',
      }

      return this.#completeFrame(outcome, acceptedCommand, [
        {
          gameKey,
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

    return this.#applyGameCommand(gameKey, command, acceptedCommand, command.type)
  }

  #applyGameCommand(
    gameKey: GameKey,
    gameCommand: MatchCommand['command'],
    acceptedCommand: MatchCommand,
    commandType: string,
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.#snapshot)

    if (lifecycle.phase === 'finished') return { _tag: 'rejected', reason: { code: 'match-already-over' } }

    if (lifecycle.phase !== 'frame-in-progress' || !this.#gameplay)
      return { _tag: 'rejected', reason: { code: 'no-active-frame' } }
    const execution = this.#executeGameCommand(gameKey, gameCommand)

    if (execution === null)
      return {
        _tag: 'parse-failed',
        reason: { code: 'unsupported-match-command', commandType },
      }

    if (execution._tag === 'rejected')
      return { _tag: 'rejected', reason: { code: 'game-command-rejected', reason: execution.reason } }

    const protocolEntryContents = execution.gameProtocolEntries.map((entry) => ({
      ...entry,
      frameIndex: lifecycle.activeFrame.frameIndex,
    }))

    return execution.outcome
      ? this.#completeFrame(execution.outcome, acceptedCommand, protocolEntryContents)
      : { _tag: 'accepted', command: acceptedCommand, protocolEntryContents }
  }

  #executeGameCommand(gameKey: GameKey, command: MatchCommand['command']) {
    const gameplay = this.#gameplay

    if (!gameplay || gameplay.key !== gameKey) throw new Error(`Missing gameplay session for ${gameKey}`)

    switch (gameplay.key) {
      case 'strila-v2': {
        const parsed = parseGameCommand(gameplay.key, command)

        return parsed._tag === 'parsed' ? gameplay.session.execute(parsed.command) : null
      }

      case 'free-pyramid-long': {
        const parsed = parseGameCommand(gameplay.key, command)

        return parsed._tag === 'parsed' ? gameplay.session.execute(parsed.command) : null
      }

      case 'free-pyramid': {
        const parsed = parseGameCommand(gameplay.key, command)

        return parsed._tag === 'parsed' ? gameplay.session.execute(parsed.command) : null
      }

      case 'combined-pyramid': {
        const parsed = parseGameCommand(gameplay.key, command)

        return parsed._tag === 'parsed' ? gameplay.session.execute(parsed.command) : null
      }

      case 'combined-pyramid-old': {
        const parsed = parseGameCommand(gameplay.key, command)

        return parsed._tag === 'parsed' ? gameplay.session.execute(parsed.command) : null
      }
    }

    throw new Error('Unsupported registered game')
  }

  #completeFrame(
    outcome: FrameOutcome,
    acceptedCommand: MatchCommand,
    protocolEntryContents: ProtocolEntryContent[],
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.#snapshot)

    if (lifecycle.phase !== 'frame-in-progress') throw new Error('Cannot complete inactive frame')
    const gameKey = gameKeyOf(lifecycle.config.gameKey)
    protocolEntryContents.push({
      gameKey,
      frameIndex: lifecycle.activeFrame.frameIndex,
      source: 'system',
      entryType: 'frame-awarded',
      seat: outcome.winnerSeat,
      scoreAfter: outcome.score,
      body: { winReason: outcome.winReason },
    })
    this.#snapshot = sendLifecycleEvent(this.#snapshot, {
      type: 'frame.completed',
      frameIndex: lifecycle.activeFrame.frameIndex,
      outcome,
    })
    const resulting = deriveLifecycleState(this.#snapshot)
    this.#completedGameResult = this.#gameplay?.session.deriveResult?.() ?? null

    if (resulting.phase === 'finished')
      protocolEntryContents.push({
        gameKey,
        frameIndex: lifecycle.activeFrame.frameIndex,
        source: 'system',
        entryType: 'match-ended',
        seat: resulting.winnerSeat,
        body: {},
      })
    else if (resulting.phase === 'frame-in-progress')
      protocolEntryContents.push({
        gameKey,
        frameIndex: resulting.activeFrame.frameIndex,
        source: 'system',
        entryType: 'frame-prepared',
        seat: resulting.activeFrame.breakerSeat,
        body: {
          targetPointsBySeat: resulting.config.targets.frameTargetPointsBySeat,
          gameConfiguration: resulting.config.gameConfiguration,
        },
      })

    this.#gameplay = resulting.phase === 'frame-in-progress' ? createGameplay(gameKey, resulting.config) : null

    return { _tag: 'accepted', command: acceptedCommand, protocolEntryContents }
  }
}

/**
 * Constructs a new executable Match with its first Frame prepared, waiting for player commencement.
 * @throws A Valibot parse error when the configuration uses an unregistered game key.
 */
export function createMatch(config: MatchConfig): Match {
  const gameKey = gameKeyOf(config.gameKey)

  return new Match(createInitialSnapshot(config), createGameplay(gameKey, config))
}

/** Validates persisted state and restores one local executable aggregate without replay. */
export function restoreMatchCheckpoint(input: MatchCheckpoint): Match {
  const lifecycle = restoreLifecycleSnapshot(input.lifecycle)
  const config = input.lifecycle.context.config
  gameKeyOf(config.gameKey)
  const phase = input.lifecycle.value
  const gameplay = input.gameplay

  if (
    (phase === 'frame-in-progress') !== (gameplay !== null) ||
    (gameplay !== null && gameplay.gameKey !== config.gameKey)
  )
    throw new Error('Inconsistent match checkpoint')

  // SAFETY: restoration dispatches by the validated key, preserving session/key correlation.
  const correlated =
    gameplay && ({ key: gameplay.gameKey, session: restoreGameplaySession(gameplay) } as AnyCorrelatedGameplay)

  return new Match(lifecycle, correlated, input.completedGameResult)
}

function gameKeyOf(value: string): GameKey {
  return v.parse(GameKey, value)
}

function wrapGameplay<K extends GameKey>(key: K, session: GameplaySession<K>): CorrelatedGameplay<K> {
  return { key, session }
}

function createGameplay(key: GameKey, config: MatchConfig): AnyCorrelatedGameplay {
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

function requireGameplay(key: GameKey, gameplay: AnyCorrelatedGameplay | null): AnyCorrelatedGameplay {
  if (!gameplay || gameplay.key !== key) throw new Error(`Missing gameplay session for ${key}`)

  return gameplay
}

function concedeControl(seat: Seat): Control {
  return { source: 'match', type: 'frame.concede', fixedInput: {}, seat, prominence: 'tertiary' }
}

function exportGameplayCheckpoint(gameplay: AnyCorrelatedGameplay): GameplayCheckpoint {
  switch (gameplay.key) {
    case 'strila-v2':
      return { gameKey: gameplay.key, state: gameplay.session.exportCheckpoint() }
    case 'free-pyramid-long':
      return { gameKey: gameplay.key, state: gameplay.session.exportCheckpoint() }
    case 'free-pyramid':
      return { gameKey: gameplay.key, state: gameplay.session.exportCheckpoint() }
    case 'combined-pyramid':
      return { gameKey: gameplay.key, state: gameplay.session.exportCheckpoint() }
    case 'combined-pyramid-old':
      return { gameKey: gameplay.key, state: gameplay.session.exportCheckpoint() }
  }

  throw new Error('Unsupported registered game')
}
