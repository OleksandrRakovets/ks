import {
  type AcceptedCommandHistoryEntry,
  type ControlCommand,
  type ControlCommandPreset,
  type ControlCommandSections,
  emptyControlCommandSections,
  type FrameOutcome,
  type FrameState,
  type MatchConfig,
  type MatchState,
  type NonEmptyProtocolEntries,
  opponentOf,
  type ProtocolEntry,
  type Seat,
  SeatSchema,
} from '@ks/core'
import { type ControlProjectionFor, type RegisteredGameKey, RegisteredGameKeySchema } from '@ks/gameplay/definitions'
import type { GameCommandFor } from '@ks/gameplay/definitions'
import {
  canonicalGameCommandPayload,
  type GameCommandRejection,
  GameCommandRejectionSchema,
  type GameplaySession,
  parseGameCommand,
} from '@ks/gameplay/server'
import { createGameplaySession } from '@ks/gameplay/server'
import * as v from 'valibot'

import type { MatchStateFor } from './matches'
import {
  createInitialSnapshot,
  projectLifecycleState,
  sendLifecycleEvent,
  type SparringMatchSnapshot,
} from './sparring-match-machine-internals'

type MatchCommandParseFailure = {
  readonly code: 'unsupported-match-command'
  readonly commandType: string
}

export type SparringMatchRejection =
  | { readonly code: 'frame-already-active' }
  | { readonly code: 'no-active-frame' }
  | { readonly code: 'wrong-breaker'; readonly expectedSeat: Seat }
  | { readonly code: 'match-already-over' }
  | { readonly code: 'game-command-rejected'; readonly reason: GameCommandRejection }

export const SparringMatchRejectionSchema = v.variant('code', [
  v.object({ code: v.literal('frame-already-active') }),
  v.object({ code: v.literal('no-active-frame') }),
  v.object({ code: v.literal('wrong-breaker'), expectedSeat: SeatSchema }),
  v.object({ code: v.literal('match-already-over') }),
  v.object({ code: v.literal('game-command-rejected'), reason: GameCommandRejectionSchema }),
])

type MatchCommandResult =
  | { readonly _tag: 'parse-failed'; readonly reason: MatchCommandParseFailure }
  | { readonly _tag: 'rejected'; readonly reason: SparringMatchRejection }
  | {
      readonly _tag: 'accepted'
      readonly command: ControlCommand
      readonly protocolEntries: NonEmptyProtocolEntries
    }

type SparringMatchRoomProjectionFor<K extends RegisteredGameKey> = {
  readonly state: MatchStateFor<K>
  readonly controlProjection: ControlProjectionFor<K> | undefined
  readonly controlSections: ControlCommandSections
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
  execute(command: ControlCommand): MatchCommandResult

  /** Returns current semantic state and controls without storage cursor metadata. */
  project(): SparringMatchRoomProjection
}

export class SparringMatchHistoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SparringMatchHistoryError'
  }
}

type CorrelatedGameplay<K extends RegisteredGameKey> = { readonly key: K; readonly session: GameplaySession<K> }
type AnyCorrelatedGameplay = { [K in RegisteredGameKey]: CorrelatedGameplay<K> }[RegisteredGameKey]
type ParsedCommand =
  | { readonly type: 'frame.prepare' }
  | { readonly type: 'frame.commence'; readonly seat: Seat }
  | { readonly type: 'frame.concede'; readonly seat: Seat }
  | {
      [K in RegisteredGameKey]: { readonly type: 'game'; readonly gameKey: K; readonly command: GameCommandFor<K> }
    }[RegisteredGameKey]

function gameKeyOf(value: string): RegisteredGameKey {
  return v.parse(RegisteredGameKeySchema, value)
}

function wrapGameplay<K extends RegisteredGameKey>(key: K, session: GameplaySession<K>): CorrelatedGameplay<K> {
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
      if (rackRollover !== 14 && rackRollover !== 15) throw new Error('Long free pyramid requires rack rollover')
      return wrapGameplay(key, createGameplaySession(key, { targetPointsBySeat, rackRollover }))
    case 'combined-pyramid':
      return wrapGameplay(key, createGameplaySession(key, { targetPointsBySeat }))
    case 'combined-pyramid-old':
      return wrapGameplay(key, createGameplaySession(key, { targetPointsBySeat }))
  }
}

function requireGameplay<K extends RegisteredGameKey>(key: K, gameplay: AnyCorrelatedGameplay | null): CorrelatedGameplay<K> {
  if (!gameplay || gameplay.key !== key) throw new Error(`Missing gameplay session for ${key}`)
  // SAFETY: the runtime key check correlates the discriminated gameplay session with K.
  return gameplay as CorrelatedGameplay<K>
}

function parseCommand(gameKey: RegisteredGameKey, command: ControlCommand): ParsedCommand | MatchCommandParseFailure {
  const failed = (): MatchCommandParseFailure => ({ code: 'unsupported-match-command', commandType: command.commandType })
  if (command.source === 'match') {
    if (command.commandType === 'frame.prepare' && v.safeParse(v.strictObject({}), command.command).success)
      return { type: 'frame.prepare' }
    if (command.commandType === 'frame.commence' || command.commandType === 'frame.concede') {
      const parsed = v.safeParse(v.strictObject({ seat: SeatSchema }), command.command)
      if (parsed.success) return { type: command.commandType, seat: parsed.output.seat }
    }
    return failed()
  }
  if (command.source !== 'game' || ['frame.prepare', 'frame.commence', 'frame.concede'].includes(command.commandType))
    return failed()
  const parsed = parseGameCommand(gameKey, { commandType: command.commandType, command: command.command })
  if (parsed._tag === 'game-command-parse-failure') return failed()
  // SAFETY: parseGameCommand produced this command for the supplied registered game key.
  return { type: 'game', gameKey, command: parsed.command } as ParsedCommand
}

function contentEqual(left: NonEmptyProtocolEntries, right: NonEmptyProtocolEntries): boolean {
  // SAFETY: Protocol values have already crossed their schema boundaries.
  const leftContent = left as StructuralValue
  // SAFETY: Protocol values have already crossed their schema boundaries.
  const rightContent = right as StructuralValue
  return structuralEqual(leftContent, rightContent)
}

type StructuralValue = undefined | null | boolean | number | string | readonly StructuralValue[] | StructuralObject
type StructuralObject = { readonly [key: string]: StructuralValue }

function structuralEqual(left: StructuralValue, right: StructuralValue): boolean {
  if (Object.is(left, right)) return true
  if (left === null || right === null || Object(left) !== left || Object(right) !== right) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structuralEqual(value, right[index]))
    )
  }
  // SAFETY: null, primitive, and array values were excluded above, leaving structural objects.
  const leftRecord = left as StructuralObject
  // SAFETY: null, primitive, and array values were excluded above, leaving structural objects.
  const rightRecord = right as StructuralObject
  const keys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined)
  const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined)
  return (
    keys.length === rightKeys.length &&
    keys.every((key) => Object.hasOwn(rightRecord, key) && structuralEqual(leftRecord[key], rightRecord[key]))
  )
}

function nonempty(contents: ProtocolEntry[]): NonEmptyProtocolEntries {
  if (!contents[0]) throw new Error('Accepted command emitted no Protocol entries')
  return [contents[0], ...contents.slice(1)]
}

function concedeControl(seat: Seat): ControlCommandPreset {
  return { source: 'match', commandType: 'frame.concede', command: { seat }, seat, prominence: 'tertiary' }
}

function mergeSections(match: ControlCommandSections, game?: ControlCommandSections): ControlCommandSections {
  const result = emptyControlCommandSections()
  result.neutral = [...match.neutral, ...(game?.neutral ?? [])]
  for (const prominence of ['primary', 'secondary', 'tertiary'] as const) {
    for (const seat of ['A', 'B'] as const)
      result[prominence][seat] = [...match[prominence][seat], ...(game?.[prominence][seat] ?? [])]
  }
  return result
}

class ResidentSparringMatch implements SparringMatch {
  private snapshot: SparringMatchSnapshot
  private gameplay: AnyCorrelatedGameplay | null

  constructor(snapshot: SparringMatchSnapshot, gameplay: AnyCorrelatedGameplay | null) {
    this.snapshot = snapshot
    this.gameplay = gameplay
  }

  execute(command: ControlCommand): MatchCommandResult {
    const lifecycle = projectLifecycleState(this.snapshot)
    const parsed = parseCommand(gameKeyOf(lifecycle.config.gameKey), command)
    if ('code' in parsed) return { _tag: 'parse-failed', reason: parsed }
    const canonical = canonicalControlCommand(parsed)
    return this.applyAggregate(parsed, canonical)
  }

  project(): SparringMatchRoomProjection {
    const lifecycle = projectLifecycleState(this.snapshot)
    const frames: FrameState[] = lifecycle.completedFrames.map((frame) => ({
      frameIndex: frame.frameIndex,
      pointsBySeat: frame.outcome.score,
      breakerSeat: frame.breakerSeat,
      winnerSeat: frame.outcome.winnerSeat,
    }))
    if (lifecycle.phase === 'frame-in-progress' && this.gameplay) {
      frames.push({
        frameIndex: lifecycle.activeFrame.frameIndex,
        breakerSeat: lifecycle.activeFrame.breakerSeat,
        pointsBySeat: this.gameplay.session.getScore(),
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
    const matchSections = emptyControlCommandSections()
    if (lifecycle.phase === 'between-frames')
      matchSections.neutral.push({ source: 'match', commandType: 'frame.prepare', command: {}, prominence: 'secondary' })
    if (lifecycle.phase === 'frame-in-progress' && this.gameplay) {
      if (this.gameplay.session.canCommence(lifecycle.activeFrame.breakerSeat)) {
        const seat = lifecycle.activeFrame.breakerSeat
        matchSections.primary[seat].push({
          source: 'match',
          commandType: 'frame.commence',
          command: { seat },
          seat,
          prominence: 'primary',
        })
      } else {
        matchSections.tertiary.A.push(concedeControl('A'))
        matchSections.tertiary.B.push(concedeControl('B'))
      }
    }
    const gameControl = this.gameplay?.session.deriveControl()
    // SAFETY: state and any gameplay control derive from the same authoritative match game key.
    return {
      state,
      controlProjection: gameControl,
      controlSections: mergeSections(matchSections, gameControl?.details.commandSections),
    } as SparringMatchRoomProjection
  }

  private applyAggregate(command: ParsedCommand, canonical: ControlCommand): MatchCommandResult {
    const lifecycle = projectLifecycleState(this.snapshot)
    if (lifecycle.phase === 'match-over') return { _tag: 'rejected', reason: { code: 'match-already-over' } }
    if (command.type === 'frame.prepare') {
      if (lifecycle.phase !== 'between-frames') return { _tag: 'rejected', reason: { code: 'frame-already-active' } }
      const frameIndex = lifecycle.nextFrameIndex
      const breakerSeat =
        frameIndex % 2 === 1 ? lifecycle.config.firstBreakerSeat : opponentOf(lifecycle.config.firstBreakerSeat)
      this.snapshot = sendLifecycleEvent(this.snapshot, { type: 'frame.prepared', frameIndex, breakerSeat })
      this.gameplay = createGameplay(gameKeyOf(lifecycle.config.gameKey), lifecycle.config)
      return {
        _tag: 'accepted',
        command: canonical,
        protocolEntries: [
          {
            frameIndex,
            source: 'system',
            entryType: 'frame-prepared',
            seat: breakerSeat,
            body: {
              gameKey: lifecycle.config.gameKey,
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
      const outcome: FrameOutcome = {
        winnerSeat: opponentOf(command.seat),
        score: this.gameplay.session.getScore(),
        winReason: 'conceded',
      }
      return this.completeFrame(outcome, canonical, [
        {
          frameIndex: lifecycle.activeFrame.frameIndex,
          source: 'player',
          entryType: 'frame-conceded',
          seat: command.seat,
          scoreAfter: outcome.score,
          body: {},
        },
      ])
    }
    if (command.type === 'frame.commence' && command.seat !== lifecycle.activeFrame.breakerSeat) {
      return { _tag: 'rejected', reason: { code: 'wrong-breaker', expectedSeat: lifecycle.activeFrame.breakerSeat } }
    }
    const gameKey = gameKeyOf(lifecycle.config.gameKey)
    const gameplay = requireGameplay(gameKey, this.gameplay)
    const gameCommand = command.type === 'frame.commence' ? command : command.command
    if (command.type === 'game' && command.gameKey !== gameKey) throw new Error('Game command key mismatch')
    // SAFETY: match and command game keys were checked before dispatch to the correlated session.
    const execution = gameplay.session.execute(gameCommand as GameCommandFor<typeof gameKey>)
    if (execution._tag === 'rejected')
      return { _tag: 'rejected', reason: { code: 'game-command-rejected', reason: execution.reason } }
    const entries = execution.protocolEntries.map((entry) => ({
      ...entry,
      frameIndex: lifecycle.activeFrame.frameIndex,
    }))
    return execution.outcome
      ? this.completeFrame(execution.outcome, canonical, entries)
      : { _tag: 'accepted', command: canonical, protocolEntries: nonempty(entries) }
  }

  private completeFrame(outcome: FrameOutcome, canonical: ControlCommand, entries: ProtocolEntry[]): MatchCommandResult {
    const lifecycle = projectLifecycleState(this.snapshot)
    if (lifecycle.phase !== 'frame-in-progress') throw new Error('Cannot complete inactive frame')
    entries.push({
      frameIndex: lifecycle.activeFrame.frameIndex,
      source: 'system',
      entryType: 'frame-awarded',
      seat: outcome.winnerSeat,
      scoreAfter: outcome.score,
      body: { gameKey: lifecycle.config.gameKey, winReason: outcome.winReason },
    })
    this.snapshot = sendLifecycleEvent(this.snapshot, {
      type: 'frame.completed',
      frameIndex: lifecycle.activeFrame.frameIndex,
      outcome,
    })
    const resulting = projectLifecycleState(this.snapshot)
    if (resulting.phase === 'match-over')
      entries.push({
        frameIndex: lifecycle.activeFrame.frameIndex,
        source: 'system',
        entryType: 'match-ended',
        seat: resulting.winnerSeat,
        body: {},
      })
    this.gameplay = null
    return { _tag: 'accepted', command: canonical, protocolEntries: nonempty(entries) }
  }

  restore(record: AcceptedCommandHistoryEntry): void {
    const parsed = parseCommand(gameKeyOf(projectLifecycleState(this.snapshot).config.gameKey), record.command)
    if ('code' in parsed) throw new SparringMatchHistoryError('Malformed stored Control Command')
    const canonical = canonicalControlCommand(parsed)
    const result = this.applyAggregate(parsed, canonical)
    // SAFETY: Control Commands and Protocol values are schema-validated JSON structures.
    const canonicalCommand = result._tag === 'accepted' ? (result.command as StructuralValue) : undefined
    // SAFETY: Control Commands and Protocol values are schema-validated JSON structures.
    const storedCommand = record.command as StructuralValue
    if (
      result._tag !== 'accepted' ||
      !canonicalCommand ||
      !structuralEqual(canonicalCommand, storedCommand) ||
      !contentEqual(result.protocolEntries, nonempty([...record.protocolEntries]))
    )
      throw new SparringMatchHistoryError('Stored Protocol does not match canonical execution')
  }
}

function canonicalControlCommand(command: ParsedCommand): ControlCommand {
  if (command.type === 'frame.prepare') return { source: 'match', commandType: command.type, command: {} }
  if (command.type === 'frame.commence' || command.type === 'frame.concede')
    return { source: 'match', commandType: command.type, command: { seat: command.seat } }
  return {
    source: 'game',
    commandType: command.command.type,
    command: canonicalGameCommandPayload(command.command),
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
export function restoreSparringMatch(config: MatchConfig, history: readonly AcceptedCommandHistoryEntry[]): SparringMatch {
  // SAFETY: createSparringMatch always constructs the private implementation in this module.
  const resident = createSparringMatch(config) as ResidentSparringMatch
  try {
    for (const record of history) resident.restore(record)
    return resident
  } catch (error) {
    if (error instanceof SparringMatchHistoryError) throw error
    throw new SparringMatchHistoryError(error instanceof Error ? error.message : 'History restoration failed')
  }
}
