import {
  CommandId,
  type Control,
  type FrameOutcome,
  type MatchCommand,
  opponentOf,
  PositiveInteger,
  Seat,
} from '@ks/core'
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

import {
  createInitialSnapshot,
  deriveLifecycleState,
  MatchMachineCheckpoint,
  type MatchPhase,
  type MatchSnapshot,
  restoreLifecycleSnapshot,
  sendLifecycleEvent,
} from './match-machine-internals'
import type { FrameState, MatchConfig, MatchState } from './matches'
import type { ProtocolEntry, ProtocolEntryContent } from './protocol'

export type { MatchPhase } from './match-machine-internals'

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
  v.pipe(v.object({ code: v.literal('frame-already-active') }), v.readonly()),
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

export const CorrectionCommand = v.pipe(
  v.strictObject({
    type: v.literal('command.correct'),
    targetSeq: PositiveInteger,
    targetCommandId: CommandId,
  }),
  v.readonly(),
)

export type CorrectionCommand = v.InferOutput<typeof CorrectionCommand>

export type MatchCorrectionTarget = {
  readonly acceptedSeq: PositiveInteger
  readonly command: MatchCommand
  readonly protocolEntries: readonly ProtocolEntry[]
}

export interface Match {
  /**
   * Executes one untrusted control command and speculatively advances resident state on acceptance.
   * The caller must discard this resident if accepted content cannot subsequently be persisted.
   * @throws An unrecoverable execution defect; resident state may have partially advanced and must be discarded.
   */
  execute(command: MatchCommand): MatchCommandResult

  /** Returns the current competition lifecycle phase. */
  phase(): MatchPhase

  /** Returns current semantic Match state, including active gameplay score. */
  state(): MatchState

  /** Returns game-specific presentation while a frame is active. */
  gamePresentation(): GamePresentationFor<GameKey> | undefined

  /** Returns currently available match and gameplay controls in stable source order. */
  controls(): readonly Control[]

  /** Game-owned result, retained when gameplay is discarded after the frame ends. */
  gameResult(): GameResult | null

  exportCheckpoint(): MatchCheckpoint
}

type CorrelatedGameplay<K extends GameKey> = {
  readonly key: K
  readonly session: GameplaySession<K>
}

type AnyCorrelatedGameplay = { [K in GameKey]: CorrelatedGameplay<K> }[GameKey]

const MatchLifecycleCommand = v.variant('type', [
  v.pipe(v.strictObject({ type: v.literal('frame.prepare') }), v.readonly()),
  v.pipe(v.strictObject({ type: v.literal('frame.commence'), seat: Seat }), v.readonly()),
  v.pipe(v.strictObject({ type: v.literal('frame.concede'), seat: Seat }), v.readonly()),
])

type MatchLifecycleCommand = v.InferOutput<typeof MatchLifecycleCommand>

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

    return this.applyGameCommand(gameKey, command.command, command, commandType)
  }

  phase(): MatchPhase {
    return deriveLifecycleState(this.snapshot).phase
  }

  state(): MatchState {
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

    return state
  }

  gamePresentation(): GamePresentationFor<GameKey> | undefined {
    const lifecycle = deriveLifecycleState(this.snapshot)

    if (lifecycle.phase !== 'frame-in-progress') return undefined
    const gameplay = requireGameplay(gameKeyOf(lifecycle.config.gameKey), this.gameplay)

    return gameplay.session.deriveControls().game
  }

  controls(): readonly Control[] {
    const lifecycle = deriveLifecycleState(this.snapshot)

    const matchControls: Control[] = []

    if (lifecycle.phase === 'between-frames')
      matchControls.push({
        source: 'match',
        type: 'frame.prepare',
        fixedInput: {},
        prominence: 'secondary',
      })

    if (lifecycle.phase !== 'frame-in-progress') {
      return matchControls
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
    return [...matchControls, ...gameControlProjection.controls]
  }

  gameResult(): GameResult | null {
    return this.gameplay?.session.deriveResult?.() ?? this.#completedGameResult
  }

  exportCheckpoint(): MatchCheckpoint {
    const gameplay = this.gameplay

    return {
      lifecycle: {
        value: this.snapshot.value,
        context: this.snapshot.context,
      },
      gameplay: gameplay ? exportGameplayCheckpoint(gameplay) : null,
      completedGameResult: this.#completedGameResult,
    }
  }

  private applyMatchCommand(
    command: MatchLifecycleCommand,
    acceptedCommand: MatchCommand,
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)
    const gameKey = gameKeyOf(lifecycle.config.gameKey)

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
      this.gameplay = createGameplay(gameKey, lifecycle.config)

      return {
        _tag: 'accepted',
        command: acceptedCommand,
        protocolEntryContents: [
          {
            gameKey,
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

    return this.applyGameCommand(gameKey, command, acceptedCommand, command.type)
  }

  private applyGameCommand(
    gameKey: GameKey,
    gameCommand: MatchCommand['command'],
    acceptedCommand: MatchCommand,
    commandType: string,
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)

    if (lifecycle.phase === 'finished') return { _tag: 'rejected', reason: { code: 'match-already-over' } }

    if (lifecycle.phase !== 'frame-in-progress' || !this.gameplay)
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
      ? this.completeFrame(execution.outcome, acceptedCommand, protocolEntryContents)
      : { _tag: 'accepted', command: acceptedCommand, protocolEntryContents }
  }

  #executeGameCommand(gameKey: GameKey, command: MatchCommand['command']) {
    const gameplay = this.gameplay

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

  private completeFrame(
    outcome: FrameOutcome,
    acceptedCommand: MatchCommand,
    protocolEntryContents: ProtocolEntryContent[],
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)

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
    this.snapshot = sendLifecycleEvent(this.snapshot, {
      type: 'frame.completed',
      frameIndex: lifecycle.activeFrame.frameIndex,
      outcome,
    })
    const resulting = deriveLifecycleState(this.snapshot)

    if (resulting.phase === 'finished')
      protocolEntryContents.push({
        gameKey,
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

  return new ResidentMatch(lifecycle, correlated, input.completedGameResult)
}

/** Compensates the current effective game command against its persisted pre-command checkpoint. */
export function correctMatch(
  matchBeforeTarget: Match,
  target: MatchCorrectionTarget,
  command: MatchCommand,
): MatchCommandResult {
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
  const gameKey = gameKeyOf(state.gameKey)

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

function createResidentMatch(config: MatchConfig): ResidentMatch {
  gameKeyOf(config.gameKey)

  return new ResidentMatch(createInitialSnapshot(config), null)
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
