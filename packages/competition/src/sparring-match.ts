import {
  type AcceptedCommand,
  type Control,
  type FrameOutcome,
  type FrameState,
  type MatchCommand,
  type MatchConfig,
  type MatchState,
  type NonEmptyProtocolEntryContents,
  opponentOf,
  type ProtocolEntryContent,
  Seat,
} from '@ks/core'
import { type GamePresentationFor, RegisteredGameKey } from '@ks/gameplay/definitions'
import type { GameCommandFor } from '@ks/gameplay/definitions'
import { GameCommandRejection, type GameplaySession, parseGameCommand } from '@ks/gameplay/server'
import { createGameplaySession } from '@ks/gameplay/server'
import * as v from 'valibot'

import type { MatchStateFor } from './matches'
import {
  createInitialSnapshot,
  deriveLifecycleState,
  sendLifecycleEvent,
  type SparringMatchSnapshot,
} from './sparring-match-machine-internals'

type MatchCommandParseFailure = {
  readonly code: 'unsupported-match-command'
  readonly commandType: string
}

export const SparringMatchRejection = v.variant('code', [
  v.pipe(v.object({ code: v.literal('frame-already-active') }), v.readonly()),
  v.pipe(v.object({ code: v.literal('no-active-frame') }), v.readonly()),
  v.pipe(v.object({ code: v.literal('wrong-breaker'), expectedSeat: Seat }), v.readonly()),
  v.pipe(v.object({ code: v.literal('match-already-over') }), v.readonly()),
  v.pipe(v.object({ code: v.literal('game-command-rejected'), reason: GameCommandRejection }), v.readonly()),
])
export type SparringMatchRejection = v.InferOutput<typeof SparringMatchRejection>

type MatchCommandResult =
  | { readonly _tag: 'parse-failed'; readonly reason: MatchCommandParseFailure }
  | { readonly _tag: 'rejected'; readonly reason: SparringMatchRejection }
  | {
      readonly _tag: 'accepted'
      readonly command: MatchCommand
      readonly protocolEntryContents: NonEmptyProtocolEntryContents
    }

type SparringMatchRoomProjectionFor<K extends RegisteredGameKey> =
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

export type SparringMatchRoomProjection = {
  [K in RegisteredGameKey]: SparringMatchRoomProjectionFor<K>
}[RegisteredGameKey]

export interface SparringMatch {
  /**
   * Executes one untrusted control command and speculatively advances resident state on acceptance.
   * The caller must discard this resident if accepted content cannot subsequently be persisted.
   * @throws An unrecoverable execution defect; resident state may have partially advanced and must be discarded.
   */
  execute(command: MatchCommand): MatchCommandResult

  /** Returns current semantic state and controls without storage cursor metadata. */
  project(): SparringMatchRoomProjection
}

export class SparringMatchHistoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SparringMatchHistoryError'
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
}

function requireGameplay<K extends RegisteredGameKey>(
  key: K,
  gameplay: AnyCorrelatedGameplay | null,
): CorrelatedGameplay<K> {
  if (!gameplay || gameplay.key !== key) throw new Error(`Missing gameplay session for ${key}`)
  // SAFETY: the runtime key check correlates the discriminated gameplay session with K.
  return gameplay as CorrelatedGameplay<K>
}

function nonempty(contents: readonly ProtocolEntryContent[]): NonEmptyProtocolEntryContents {
  if (!contents[0]) throw new Error('Accepted command emitted no Protocol entries')
  return [contents[0], ...contents.slice(1)]
}

function concedeControl(seat: Seat): Control {
  return { source: 'match', type: 'frame.concede', fixedInput: {}, seat, prominence: 'tertiary' }
}

class ResidentSparringMatch implements SparringMatch {
  private snapshot: SparringMatchSnapshot
  private gameplay: AnyCorrelatedGameplay | null

  constructor(snapshot: SparringMatchSnapshot, gameplay: AnyCorrelatedGameplay | null) {
    this.snapshot = snapshot
    this.gameplay = gameplay
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

  project(): SparringMatchRoomProjection {
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
    const state: MatchState = {
      matchId: lifecycle.config.matchId,
      gameKey: lifecycle.config.gameKey,
      targets: lifecycle.config.targets,
      status: lifecycle.phase === 'match-over' ? 'finished' : 'active',
      currentFrameIndex,
      framesWonBySeat: lifecycle.framesWonBySeat,
      frames,
    }
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
      return { state, game: undefined, controls: matchControls } as SparringMatchRoomProjection
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
    } as SparringMatchRoomProjection
  }

  private applyMatchCommand(
    command: MatchLifecycleCommand,
    acceptedCommand: MatchCommand,
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)
    if (lifecycle.phase === 'match-over') return { _tag: 'rejected', reason: { code: 'match-already-over' } }
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
    if (lifecycle.phase === 'match-over') return { _tag: 'rejected', reason: { code: 'match-already-over' } }
    if (lifecycle.phase !== 'frame-in-progress' || !this.gameplay)
      return { _tag: 'rejected', reason: { code: 'no-active-frame' } }
    const gameplay = requireGameplay(gameKey, this.gameplay)
    const execution = gameplay.session.execute(gameCommand)
    if (execution._tag === 'rejected')
      return { _tag: 'rejected', reason: { code: 'game-command-rejected', reason: execution.reason } }
    const entryContents = execution.gameProtocolEntries.map((entry) => ({
      ...entry,
      frameIndex: lifecycle.activeFrame.frameIndex,
    }))
    return execution.outcome
      ? this.completeFrame(execution.outcome, acceptedCommand, entryContents)
      : { _tag: 'accepted', command: acceptedCommand, protocolEntryContents: nonempty(entryContents) }
  }

  private completeFrame(
    outcome: FrameOutcome,
    acceptedCommand: MatchCommand,
    entryContents: ProtocolEntryContent[],
  ): MatchCommandResult {
    const lifecycle = deriveLifecycleState(this.snapshot)
    if (lifecycle.phase !== 'frame-in-progress') throw new Error('Cannot complete inactive frame')
    entryContents.push({
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
    if (resulting.phase === 'match-over')
      entryContents.push({
        gameKey: lifecycle.config.gameKey,
        frameIndex: lifecycle.activeFrame.frameIndex,
        source: 'system',
        entryType: 'match-ended',
        seat: resulting.winnerSeat,
        body: {},
      })
    this.gameplay = null
    return { _tag: 'accepted', command: acceptedCommand, protocolEntryContents: nonempty(entryContents) }
  }

  restore(command: AcceptedCommand): NonEmptyProtocolEntryContents {
    const result = this.execute(command)
    if (result._tag === 'parse-failed') throw new SparringMatchHistoryError('Malformed stored Match Command')
    if (result._tag !== 'accepted')
      throw new SparringMatchHistoryError('Stored accepted Command is not executable')
    return result.protocolEntryContents
  }
}

/**
 * Drafts semantic creation content without constructing resident state.
 * @throws A Valibot parse error when the configuration uses an unregistered game key.
 */
export function createSparringMatch(config: MatchConfig): SparringMatch {
  gameKeyOf(config.gameKey)
  return new ResidentSparringMatch(createInitialSnapshot(config), null)
}

/**
 * Restores disposable resident state from envelope-validated semantic command batches.
 * @throws SparringMatchHistoryError when accepted history is impossible or incompatible with current rules.
 */
export function restoreSparringMatch(
  config: MatchConfig,
  history: readonly AcceptedCommand[],
): RestoredSparringMatch {
  // SAFETY: createSparringMatch always constructs the private implementation in this module.
  const resident = createSparringMatch(config) as ResidentSparringMatch
  try {
    const accepted = history.map((acceptedCommand) => ({
      acceptedCommand,
      protocolEntryContents: resident.restore(acceptedCommand),
    }))
    return { match: resident, accepted }
  } catch (error) {
    if (error instanceof SparringMatchHistoryError) throw error
    throw new SparringMatchHistoryError(error instanceof Error ? error.message : 'History restoration failed')
  }
}

export type RestoredSparringMatch = {
  readonly match: SparringMatch
  readonly accepted: readonly {
    readonly acceptedCommand: AcceptedCommand
    readonly protocolEntryContents: NonEmptyProtocolEntryContents
  }[]
}
