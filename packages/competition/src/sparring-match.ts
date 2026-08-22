import {
  type BySeatNumber,
  type ControlCommand,
  type ControlCommandPayload,
  type ControlCommandPreset,
  type ControlCommandSections,
  emptyControlCommandSections,
  type FrameOutcome,
  type FrameState,
  type MatchConfig,
  type MatchFactDraft,
  type MatchSnapshot,
  opponentOf,
  type Seat,
  SeatSchema,
  type StoredMatchFact,
} from '@ks/core'
import {
  type ControlProjectionFor,
  type GameStateFor,
  type RegisteredGameKey,
  RegisteredGameKeySchema,
} from '@ks/gameplay/definitions'
import type { GameCreateStateArgs } from '@ks/gameplay/definitions'
import {
  type GameCommandRejection,
  GameCommandRejectionSchema,
  type GameplaySession,
  type PreparedGameTransition,
} from '@ks/gameplay/server'
import { createGameplaySession } from '@ks/gameplay/server'
import * as v from 'valibot'

import { type MatchSnapshotFor } from './matches'
import {
  createInitialSnapshot,
  createSparringMatchActor,
  createSparringMatchActorFromSnapshot,
  previewLifecycleEvents,
  projectLifecycleState,
  sendLifecycleEvent,
  type SparringMatchActor,
  type SparringMatchLifecycleEvent,
  type SparringMatchSnapshot,
  sparringSnapshotsEqual,
} from './sparring-match-machine'

const PreparedSparringMatchTransitionBrand = Symbol('PreparedSparringMatchTransitionBrand')

export type PreparedSparringMatchTransition = {
  readonly [PreparedSparringMatchTransitionBrand]: true
}

export type SparringMatchCommand =
  | { readonly type: 'frame.start' }
  | { readonly type: 'frame.commence'; readonly seat: Seat }
  | { readonly type: 'frame.concede'; readonly seat: Seat }
  | {
      readonly type: 'game.command'
      readonly commandType: string
      readonly command: ControlCommandPayload
    }

export type ParseSparringMatchCommandResult =
  | { readonly _tag: 'parsed'; readonly command: SparringMatchCommand }
  | {
      readonly _tag: 'parse-failed'
      readonly reason: {
        readonly code: 'unsupported-match-command'
        readonly commandType: string
      }
    }

export type SparringMatchRejection =
  | { readonly code: 'frame-already-active' }
  | { readonly code: 'no-active-frame' }
  | { readonly code: 'wrong-breaker'; readonly expectedSeat: Seat }
  | { readonly code: 'match-already-over' }
  | {
      readonly code: 'game-command-rejected'
      readonly reason: GameCommandRejection
    }

export const SparringMatchRejectionSchema = v.variant('code', [
  v.object({ code: v.literal('frame-already-active') }),
  v.object({ code: v.literal('no-active-frame') }),
  v.object({
    code: v.literal('wrong-breaker'),
    expectedSeat: SeatSchema,
  }),
  v.object({ code: v.literal('match-already-over') }),
  v.object({
    code: v.literal('game-command-rejected'),
    reason: GameCommandRejectionSchema,
  }),
])

export type SparringMatchDecision =
  | {
      readonly _tag: 'accepted'
      readonly facts: readonly [MatchFactDraft, ...MatchFactDraft[]]
      readonly transition: PreparedSparringMatchTransition
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: SparringMatchRejection
    }

export type ActiveGameState<K extends RegisteredGameKey> = {
  readonly gameKey: K
  readonly state: GameStateFor<K>
}

export type AnyActiveGameState = {
  [K in RegisteredGameKey]: ActiveGameState<K>
}[RegisteredGameKey]

type SparringMatchStateBase = {
  readonly config: MatchConfig
  readonly frames: readonly FrameState[]
  readonly framesWonBySeat: BySeatNumber
  readonly currentFrameIndex: number
}

export type SparringMatchState =
  | (SparringMatchStateBase & {
      readonly phase: 'between-frames'
      readonly activeGame: null
      readonly winnerSeat: null
    })
  | (SparringMatchStateBase & {
      readonly phase: 'frame-in-progress'
      readonly activeGame: AnyActiveGameState
      readonly winnerSeat: null
    })
  | (SparringMatchStateBase & {
      readonly phase: 'match-over'
      readonly activeGame: null
      readonly winnerSeat: Seat
    })

export type SparringMatchRoomProjectionFor<K extends RegisteredGameKey> = {
  readonly snapshot: MatchSnapshotFor<K>
  readonly controlProjection: ControlProjectionFor<K> | undefined
  readonly controlSections: ControlCommandSections
}

export type SparringMatchRoomProjection = {
  [K in RegisteredGameKey]: SparringMatchRoomProjectionFor<K>
}[RegisteredGameKey]

export interface SparringMatchSession {
  readonly state: SparringMatchState

  decide(command: SparringMatchCommand): SparringMatchDecision

  applyCommitted(transition: PreparedSparringMatchTransition, facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): void

  project(latestSeq: number): SparringMatchRoomProjection
  dispose(): void
}

type GameplayCreateArgs = GameCreateStateArgs

type PreparedLifecycleEvidence = {
  readonly previousSnapshot: SparringMatchSnapshot
  readonly candidateSnapshot: SparringMatchSnapshot
}

type PreparedSparringMatchTransitionRecord = {
  ownerId: symbol
  revision: number
  drafts: readonly [MatchFactDraft, ...MatchFactDraft[]]
  lifecycleEvents: readonly SparringMatchLifecycleEvent[]
  machineEvidence: PreparedLifecycleEvidence
  gameplayTransition: PreparedGameTransition<RegisteredGameKey> | null
  createGameplayOnApply: GameplayCreateArgs | null
  disposeGameplayAfterApply: boolean
  consumed: boolean
}

type ReplayState = {
  snapshot: SparringMatchSnapshot
  gameplay: GameplaySession<RegisteredGameKey> | null
  pendingCompletion: FrameOutcome | null
}

type SessionRuntime = {
  actor: SparringMatchActor
  gameplay: GameplaySession<RegisteredGameKey> | null
}

const preparedSparringTransitionRecords = new WeakMap<object, PreparedSparringMatchTransitionRecord>()
const activeSparringSessionOwners = new Set<symbol>()

export class SparringMatchSessionDisposedError extends Error {
  constructor() {
    super('Sparring match session is disposed')
    this.name = 'SparringMatchSessionDisposedError'
  }
}

export class SparringMatchSessionUnusableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SparringMatchSessionUnusableError'
  }
}

export class InvalidSparringPreparedTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSparringPreparedTransitionError'
  }
}

export class SparringMatchReplayError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SparringMatchReplayError'
  }
}

function parseRegisteredGameKey(gameKey: string): RegisteredGameKey {
  return v.parse(RegisteredGameKeySchema, gameKey)
}

function parseRegisteredGameKeyForReplay(gameKey: string): RegisteredGameKey {
  const parsed = v.safeParse(RegisteredGameKeySchema, gameKey)
  if (!parsed.success) throw new SparringMatchReplayError('Unknown registered game key')
  return parsed.output
}

function disposeReplayGameplay(replay: ReplayState): void {
  replay.gameplay?.dispose()
  replay.gameplay = null
}

function winsAfterOutcome(framesWonBySeat: BySeatNumber, outcome: FrameOutcome): BySeatNumber {
  return {
    A: framesWonBySeat.A + (outcome.winnerSeat === 'A' ? 1 : 0),
    B: framesWonBySeat.B + (outcome.winnerSeat === 'B' ? 1 : 0),
  }
}

function isMatchTargetReached(framesWonBySeat: BySeatNumber, matchTargetFrames: number, winnerSeat: Seat): boolean {
  return framesWonBySeat[winnerSeat] >= matchTargetFrames
}

function gameplayArgsFromFrameStarted(
  payload: Extract<MatchFactDraft, { type: 'frame.started' }>['payload'],
): GameCreateStateArgs {
  const args: GameCreateStateArgs = {
    targetPointsBySeat: payload.targetPointsBySeat,
    breakerSeat: payload.breakerSeat,
  }
  if (payload.gameConfiguration) args.gameConfiguration = payload.gameConfiguration
  return args
}

function gameplayArgsFromConfig(config: MatchConfig, breakerSeat: Seat): GameCreateStateArgs {
  const args: GameCreateStateArgs = {
    targetPointsBySeat: config.targets.frameTargetPointsBySeat,
    breakerSeat,
  }
  if (config.gameConfiguration) args.gameConfiguration = config.gameConfiguration
  return args
}

function activeGameFromSession(session: GameplaySession<RegisteredGameKey>): AnyActiveGameState {
  switch (session.gameKey) {
    case 'strila-v2':
      // SAFETY: branch matches session.gameKey, so the session is the strila-v2 gameplay session.
      return { gameKey: 'strila-v2', state: (session as GameplaySession<'strila-v2'>).state }
    case 'free-pyramid':
      // SAFETY: branch matches session.gameKey, so the session is the free-pyramid gameplay session.
      return { gameKey: 'free-pyramid', state: (session as GameplaySession<'free-pyramid'>).state }
    case 'free-pyramid-long':
      // SAFETY: branch matches session.gameKey, so the session is the free-pyramid-long gameplay session.
      return { gameKey: 'free-pyramid-long', state: (session as GameplaySession<'free-pyramid-long'>).state }
    case 'combined-pyramid':
      // SAFETY: branch matches session.gameKey, so the session is the combined-pyramid gameplay session.
      return { gameKey: 'combined-pyramid', state: (session as GameplaySession<'combined-pyramid'>).state }
    case 'combined-pyramid-old':
      // SAFETY: branch matches session.gameKey, so the session is the combined-pyramid-old gameplay session.
      return { gameKey: 'combined-pyramid-old', state: (session as GameplaySession<'combined-pyramid-old'>).state }
  }
}

type MatchSnapshotBase = Omit<MatchSnapshot, 'gameKey'>

function snapshotBaseFromState(state: SparringMatchState, latestSeq: number): MatchSnapshotBase {
  return {
    matchId: state.config.matchId,
    targets: state.config.targets,
    status: state.phase === 'match-over' ? 'finished' : 'active',
    currentFrameIndex: state.currentFrameIndex,
    framesWonBySeat: state.framesWonBySeat,
    frames: [...state.frames],
    latestSeq,
  }
}

function projectRoomForGameKey<K extends RegisteredGameKey>(
  gameKey: K,
  snapshotBase: MatchSnapshotBase,
  controlProjection: ControlProjectionFor<K> | undefined,
  controlSections: ControlCommandSections,
): SparringMatchRoomProjectionFor<K> {
  return {
    snapshot: { ...snapshotBase, gameKey },
    controlProjection,
    controlSections,
  }
}

function projectRoom(
  gameKey: RegisteredGameKey,
  snapshotBase: MatchSnapshotBase,
  gameplay: GameplaySession<RegisteredGameKey> | null,
  controlSections: ControlCommandSections,
): SparringMatchRoomProjection {
  switch (gameKey) {
    case 'strila-v2': {
      // SAFETY: the guard matches session.gameKey to this branch's registered game key.
      const narrowedGameplay = gameplay?.gameKey === 'strila-v2' ? (gameplay as GameplaySession<'strila-v2'>) : null
      return projectRoomForGameKey(
        'strila-v2',
        snapshotBase,
        narrowedGameplay ? narrowedGameplay.deriveControl() : undefined,
        controlSections,
      )
    }
    case 'free-pyramid': {
      // SAFETY: the guard matches session.gameKey to this branch's registered game key.
      const narrowedGameplay = gameplay?.gameKey === 'free-pyramid' ? (gameplay as GameplaySession<'free-pyramid'>) : null
      return projectRoomForGameKey(
        'free-pyramid',
        snapshotBase,
        narrowedGameplay ? narrowedGameplay.deriveControl() : undefined,
        controlSections,
      )
    }
    case 'free-pyramid-long': {
      // SAFETY: the guard matches session.gameKey to this branch's registered game key.
      const narrowedGameplay =
        gameplay?.gameKey === 'free-pyramid-long' ? (gameplay as GameplaySession<'free-pyramid-long'>) : null
      return projectRoomForGameKey(
        'free-pyramid-long',
        snapshotBase,
        narrowedGameplay ? narrowedGameplay.deriveControl() : undefined,
        controlSections,
      )
    }
    case 'combined-pyramid': {
      // SAFETY: the guard matches session.gameKey to this branch's registered game key.
      const narrowedGameplay =
        gameplay?.gameKey === 'combined-pyramid' ? (gameplay as GameplaySession<'combined-pyramid'>) : null
      return projectRoomForGameKey(
        'combined-pyramid',
        snapshotBase,
        narrowedGameplay ? narrowedGameplay.deriveControl() : undefined,
        controlSections,
      )
    }
    case 'combined-pyramid-old': {
      // SAFETY: the guard matches session.gameKey to this branch's registered game key.
      const narrowedGameplay =
        gameplay?.gameKey === 'combined-pyramid-old' ? (gameplay as GameplaySession<'combined-pyramid-old'>) : null
      return projectRoomForGameKey(
        'combined-pyramid-old',
        snapshotBase,
        narrowedGameplay ? narrowedGameplay.deriveControl() : undefined,
        controlSections,
      )
    }
  }
}

function nonemptyDrafts(drafts: MatchFactDraft[]): [MatchFactDraft, ...MatchFactDraft[]] {
  const [first, ...rest] = drafts
  if (!first) throw new Error('Expected at least one fact draft')
  return [first, ...rest]
}

function draftMatchesFact(draft: MatchFactDraft, fact: StoredMatchFact): boolean {
  return draft.type === fact.type && JSON.stringify(draft.payload) === JSON.stringify(fact.payload)
}

function createPreparedSparringTransition(
  record: Omit<PreparedSparringMatchTransitionRecord, 'consumed'>,
): PreparedSparringMatchTransition {
  const transition = { [PreparedSparringMatchTransitionBrand]: true as const }
  preparedSparringTransitionRecords.set(transition, { ...record, consumed: false })
  return transition
}

function readPreparedSparringTransition(transition: PreparedSparringMatchTransition): PreparedSparringMatchTransitionRecord {
  const record = preparedSparringTransitionRecords.get(transition)
  if (!record) throw new InvalidSparringPreparedTransitionError('Prepared transition is invalid or expired')
  return record
}

function gamePhaseForControls(state: GameStateFor<RegisteredGameKey>): string {
  return state.phase
}

function concedeFrameCommand(seat: Seat): ControlCommandPreset {
  return {
    source: 'match',
    commandType: 'frame.concede',
    command: { seat },
    seat,
    prominence: 'tertiary',
  }
}

function mergeControlCommandSections(
  matchSections: ControlCommandSections,
  gameSections?: ControlCommandSections,
): ControlCommandSections {
  const sections = emptyControlCommandSections()
  sections.neutral = [...matchSections.neutral, ...(gameSections?.neutral ?? [])]

  for (const prominence of ['primary', 'secondary', 'tertiary'] as const) {
    for (const bucket of ['A', 'B'] as const) {
      sections[prominence][bucket] = [...matchSections[prominence][bucket], ...(gameSections?.[prominence][bucket] ?? [])]
    }
  }

  return sections
}

function deriveMatchControlSections(state: SparringMatchState): ControlCommandSections {
  const sections = emptyControlCommandSections()

  if (state.phase === 'between-frames') {
    sections.neutral.push({
      source: 'match',
      commandType: 'frame.start',
      command: {},
      prominence: 'secondary',
    })
    return sections
  }

  if (state.phase === 'match-over') return sections

  const currentFrame = state.frames.at(-1)
  if (!currentFrame || currentFrame.winnerSeat) return sections

  const gamePhase = gamePhaseForControls(state.activeGame.state)
  if (gamePhase === 'not-started') {
    sections.primary[currentFrame.breakerSeat].push({
      source: 'match',
      commandType: 'frame.commence',
      command: { seat: currentFrame.breakerSeat },
      seat: currentFrame.breakerSeat,
      prominence: 'primary',
    })
    return sections
  }

  sections.tertiary.A.push(concedeFrameCommand('A'))
  sections.tertiary.B.push(concedeFrameCommand('B'))
  return sections
}

function buildFramesFromLifecycle(replay: ReplayState): FrameState[] {
  const lifecycle = projectLifecycleState(replay.snapshot)
  const frames: FrameState[] = lifecycle.completedFrames.map((frame) => ({
    frameIndex: frame.frameIndex,
    pointsBySeat: frame.outcome.score,
    breakerSeat: frame.breakerSeat,
    winnerSeat: frame.outcome.winnerSeat,
  }))

  if (lifecycle.phase === 'frame-in-progress' && replay.gameplay) {
    const score = replay.gameplay.deriveSummary().score
    frames.push({
      frameIndex: lifecycle.activeFrame.frameIndex,
      pointsBySeat: score,
      breakerSeat: lifecycle.activeFrame.breakerSeat,
    })
  }

  return frames
}

function currentFrameIndexFromLifecycle(snapshot: SparringMatchSnapshot): number {
  const lifecycle = projectLifecycleState(snapshot)
  switch (lifecycle.phase) {
    case 'between-frames':
      return lifecycle.completedFrames.length === 0 ? 0 : lifecycle.completedFrames.at(-1)!.frameIndex
    case 'frame-in-progress':
      return lifecycle.activeFrame.frameIndex
    case 'match-over':
      return lifecycle.completedFrames.at(-1)?.frameIndex ?? 0
  }
}

function buildSparringMatchState(replay: ReplayState): SparringMatchState {
  const lifecycle = projectLifecycleState(replay.snapshot)
  const base = {
    config: lifecycle.config,
    frames: buildFramesFromLifecycle(replay),
    framesWonBySeat: lifecycle.framesWonBySeat,
    currentFrameIndex: currentFrameIndexFromLifecycle(replay.snapshot),
  }

  switch (lifecycle.phase) {
    case 'between-frames':
      return { ...base, phase: 'between-frames', activeGame: null, winnerSeat: null }
    case 'frame-in-progress':
      if (!replay.gameplay) throw new SparringMatchSessionUnusableError('Missing gameplay session during active frame')
      return {
        ...base,
        phase: 'frame-in-progress',
        activeGame: activeGameFromSession(replay.gameplay),
        winnerSeat: null,
      }
    case 'match-over':
      return { ...base, phase: 'match-over', activeGame: null, winnerSeat: lifecycle.winnerSeat }
  }
}

function toReplayError(caught: SparringMatchReplayError | Error, fallback: string): SparringMatchReplayError {
  if (caught instanceof SparringMatchReplayError) return caught
  if (caught instanceof Error && caught.message.length > 0) return new SparringMatchReplayError(caught.message)
  return new SparringMatchReplayError(fallback)
}

function gameConfigurationsMatch(
  configValue: MatchConfig['gameConfiguration'],
  factValue: Extract<MatchFactDraft, { type: 'frame.started' }>['payload']['gameConfiguration'],
): boolean {
  const configPresent = configValue !== undefined
  const factPresent = factValue !== undefined
  if (!configPresent && !factPresent) return true
  if (configPresent !== factPresent) return false
  return JSON.stringify(configValue) === JSON.stringify(factValue)
}

function groupReplayBatches(facts: readonly StoredMatchFact[]): StoredMatchFact[][] {
  const batches: StoredMatchFact[][] = []
  let current: StoredMatchFact[] = []

  for (const fact of facts) {
    if (fact.type === 'match.created') {
      if (current.length > 0) batches.push(current)
      batches.push([fact])
      current = []
      continue
    }

    if (current.length === 0) {
      current = [fact]
      continue
    }

    const previous = current[current.length - 1]!
    if (previous.type === 'match.created') {
      batches.push(current)
      current = [fact]
      continue
    }

    if (fact.causedByCommandId === previous.causedByCommandId) {
      current.push(fact)
    } else {
      batches.push(current)
      current = [fact]
    }
  }

  if (current.length > 0) batches.push(current)
  return batches
}

function validateReplayBatch(batch: StoredMatchFact[]): void {
  if (batch.length === 0) return

  const first = batch[0]!
  if (first.type === 'match.created') {
    if (batch.length !== 1) throw new SparringMatchReplayError('match.created must appear alone in its batch')
    return
  }

  for (let index = 1; index < batch.length; index += 1) {
    const fact = batch[index]!
    if (fact.type === 'match.created') throw new SparringMatchReplayError('Unexpected match.created after creation')
    if (fact.causedByCommandId !== first.causedByCommandId) {
      throw new SparringMatchReplayError('Committed batch command causation mismatch')
    }
    if (fact.occurredAt !== first.occurredAt) {
      throw new SparringMatchReplayError('Committed batch occurrence time mismatch')
    }
  }

  const gameCommands = batch.filter((fact) => fact.type === 'game.command')
  const completions = batch.filter((fact) => fact.type === 'frame.completed')
  const terminals = batch.filter((fact) => fact.type === 'match.ended')

  if (gameCommands.length > 1) throw new SparringMatchReplayError('Batch contains duplicate game commands')
  if (completions.length > 1) throw new SparringMatchReplayError('Batch contains duplicate frame completions')
  if (terminals.length > 1) throw new SparringMatchReplayError('Batch contains duplicate match.ended facts')

  if (terminals.length > 0) {
    if (batch.at(-1)?.type !== 'match.ended') throw new SparringMatchReplayError('match.ended must be last in batch')
    const completion = batch.find((fact) => fact.type === 'frame.completed')
    if (!completion || completion.type !== 'frame.completed') {
      throw new SparringMatchReplayError('match.ended requires frame.completed in same batch')
    }
    const terminal = terminals[0]!
    if (terminal.type !== 'match.ended') throw new SparringMatchReplayError('Missing terminal match.ended fact')
    if (completion.payload.outcome.winnerSeat !== terminal.payload.winnerSeat) {
      throw new SparringMatchReplayError('Terminal winner does not match completing frame')
    }
  }

  if (gameCommands.length === 1 && completions.length === 1) {
    const gameCommand = gameCommands[0]!
    const completion = completions[0]!
    if (batch.indexOf(completion) !== batch.indexOf(gameCommand) + 1) {
      throw new SparringMatchReplayError('Outcome-producing game command must be immediately followed by frame.completed')
    }
  }

  if (gameCommands.length === 1 && completions.length === 0 && batch.length > 1) {
    throw new SparringMatchReplayError('Missing expected frame.completed after outcome-producing game command')
  }

  if (gameCommands.length === 0 && completions.length === 1 && terminals.length === 1 && batch.length !== 2) {
    throw new SparringMatchReplayError('Concession batch must contain frame.completed and match.ended only')
  }
}
function appendCompletionDrafts(args: {
  config: MatchConfig
  frameIndex: number
  outcome: FrameOutcome
  framesWonBySeat: BySeatNumber
  drafts: MatchFactDraft[]
}): void {
  const { config, frameIndex, outcome, framesWonBySeat, drafts } = args
  drafts.push({
    type: 'frame.completed',
    payload: { frameIndex, gameKey: config.gameKey, outcome },
  })
  const nextWins = winsAfterOutcome(framesWonBySeat, outcome)
  if (isMatchTargetReached(nextWins, config.targets.matchTargetFrames, outcome.winnerSeat)) {
    drafts.push({
      type: 'match.ended',
      payload: { winnerSeat: outcome.winnerSeat },
    })
  }
}

function validateReplayJournal(facts: readonly StoredMatchFact[]): void {
  if (facts.length === 0) throw new SparringMatchReplayError('Journal must not be empty')
  if (facts[0]!.seq !== 1) throw new SparringMatchReplayError('Journal sequence must begin at 1')
  for (let index = 1; index < facts.length; index += 1) {
    if (facts[index]!.seq !== facts[index - 1]!.seq + 1) {
      throw new SparringMatchReplayError('Journal sequence must be contiguous')
    }
  }
  if (facts[0]!.type !== 'match.created') throw new SparringMatchReplayError('Journal must begin with match.created')
  const creationCount = facts.filter((fact) => fact.type === 'match.created').length
  if (creationCount !== 1) throw new SparringMatchReplayError('Journal must contain exactly one match.created fact')
}

function validateFrameStartedFact(
  fact: Extract<StoredMatchFact, { type: 'frame.started' }>,
  snapshot: SparringMatchSnapshot,
): void {
  const lifecycle = projectLifecycleState(snapshot)
  if (lifecycle.phase !== 'between-frames') throw new SparringMatchReplayError('Frame started while frame already active')
  if (fact.matchId !== lifecycle.config.matchId) throw new SparringMatchReplayError('Fact match ID mismatch')
  if (fact.payload.frameIndex !== lifecycle.nextFrameIndex) throw new SparringMatchReplayError('Frame index mismatch')
  const expectedBreaker =
    fact.payload.frameIndex % 2 === 1 ? lifecycle.config.firstBreakerSeat : opponentOf(lifecycle.config.firstBreakerSeat)
  if (fact.payload.breakerSeat !== expectedBreaker) throw new SparringMatchReplayError('Frame breaker mismatch')
  if (fact.payload.gameKey !== lifecycle.config.gameKey) throw new SparringMatchReplayError('Frame game key mismatch')
  if (
    fact.payload.targetPointsBySeat.A !== lifecycle.config.targets.frameTargetPointsBySeat.A ||
    fact.payload.targetPointsBySeat.B !== lifecycle.config.targets.frameTargetPointsBySeat.B
  ) {
    throw new SparringMatchReplayError('Frame target mismatch')
  }
  if (!gameConfigurationsMatch(lifecycle.config.gameConfiguration, fact.payload.gameConfiguration)) {
    throw new SparringMatchReplayError('Frame game configuration mismatch')
  }
}

function validateGameCommandFact(
  fact: Extract<StoredMatchFact, { type: 'game.command' }>,
  snapshot: SparringMatchSnapshot,
): void {
  const lifecycle = projectLifecycleState(snapshot)
  if (lifecycle.phase !== 'frame-in-progress') throw new SparringMatchReplayError('Game command without active frame')
  if (fact.matchId !== lifecycle.config.matchId) throw new SparringMatchReplayError('Fact match ID mismatch')
  if (fact.payload.frameIndex !== lifecycle.activeFrame.frameIndex) {
    throw new SparringMatchReplayError('Game command frame index mismatch')
  }
  if (fact.payload.gameKey !== lifecycle.config.gameKey) throw new SparringMatchReplayError('Game command game key mismatch')
}

function validateFrameCompletedFact(
  fact: Extract<StoredMatchFact, { type: 'frame.completed' }>,
  snapshot: SparringMatchSnapshot,
): void {
  const lifecycle = projectLifecycleState(snapshot)
  if (lifecycle.phase !== 'frame-in-progress') throw new SparringMatchReplayError('Frame completed without active frame')
  if (fact.matchId !== lifecycle.config.matchId) throw new SparringMatchReplayError('Fact match ID mismatch')
  if (fact.payload.frameIndex !== lifecycle.activeFrame.frameIndex) {
    throw new SparringMatchReplayError('Completed frame index mismatch')
  }
  if (fact.payload.gameKey !== lifecycle.config.gameKey) throw new SparringMatchReplayError('Completed frame game key mismatch')
}

function validateMatchEndedFact(
  fact: Extract<StoredMatchFact, { type: 'match.ended' }>,
  snapshot: SparringMatchSnapshot,
  previousFact: StoredMatchFact | undefined,
): void {
  const lifecycle = projectLifecycleState(snapshot)
  if (lifecycle.phase !== 'match-over') throw new SparringMatchReplayError('Match ended before terminal lifecycle state')
  if (fact.matchId !== lifecycle.config.matchId) throw new SparringMatchReplayError('Fact match ID mismatch')
  if (lifecycle.winnerSeat !== fact.payload.winnerSeat) throw new SparringMatchReplayError('Terminal winner mismatch')
  if (!previousFact || previousFact.type !== 'frame.completed') {
    throw new SparringMatchReplayError('match.ended must immediately follow frame.completed')
  }
  if (previousFact.payload.outcome.winnerSeat !== fact.payload.winnerSeat) {
    throw new SparringMatchReplayError('Terminal winner does not match completing frame')
  }
}

function applyReplayFact(replay: ReplayState, fact: StoredMatchFact, previousFact: StoredMatchFact | undefined): void {
  try {
    switch (fact.type) {
      case 'frame.started': {
        validateFrameStartedFact(fact, replay.snapshot)
        replay.snapshot = sendLifecycleEvent(replay.snapshot, {
          type: 'frame.started',
          frameIndex: fact.payload.frameIndex,
          breakerSeat: fact.payload.breakerSeat,
        })
        const gameKey = parseRegisteredGameKey(fact.payload.gameKey)
        replay.gameplay = createGameplaySession(gameKey, gameplayArgsFromFrameStarted(fact.payload))
        replay.pendingCompletion = null
        return
      }
      case 'game.command': {
        if (!replay.gameplay) throw new SparringMatchReplayError('Game command without active frame')
        validateGameCommandFact(fact, replay.snapshot)
        const decision = replay.gameplay.decide(fact.payload.commandType, fact.payload.command)
        if (decision._tag === 'rejected') {
          throw new SparringMatchReplayError(`Replay rejected game command ${fact.payload.commandType}`)
        }
        if (JSON.stringify(decision.result.protocolEntries) !== JSON.stringify(fact.payload.protocolEntries)) {
          throw new SparringMatchReplayError('Stored game protocol entries do not match replayed command')
        }
        replay.gameplay.applyCommitted(decision.transition)
        replay.pendingCompletion = decision.result.outcome ?? null
        return
      }
      case 'frame.completed': {
        validateFrameCompletedFact(fact, replay.snapshot)
        if (replay.pendingCompletion) {
          if (JSON.stringify(fact.payload.outcome) !== JSON.stringify(replay.pendingCompletion)) {
            throw new SparringMatchReplayError('Frame completion outcome mismatch')
          }
          replay.pendingCompletion = null
        } else {
          if (!replay.gameplay) throw new SparringMatchReplayError('Frame completed without active gameplay session')
          const score = replay.gameplay.deriveSummary().score
          if (fact.payload.outcome.winReason !== 'conceded') {
            throw new SparringMatchReplayError('Unexpected frame completion without preceding game outcome')
          }
          if (fact.payload.outcome.score.A !== score.A || fact.payload.outcome.score.B !== score.B) {
            throw new SparringMatchReplayError('Concession score mismatch')
          }
        }
        replay.snapshot = sendLifecycleEvent(replay.snapshot, {
          type: 'frame.completed',
          frameIndex: fact.payload.frameIndex,
          outcome: fact.payload.outcome,
        })
        replay.gameplay?.dispose()
        replay.gameplay = null
        return
      }
      case 'match.ended': {
        validateMatchEndedFact(fact, replay.snapshot, previousFact)
        return
      }
      default:
        throw new SparringMatchReplayError(`Unexpected fact type during replay`)
    }
  } catch (caught) {
    throw toReplayError(
      caught instanceof Error ? caught : new SparringMatchReplayError('Replay fact application failed'),
      'Replay fact application failed',
    )
  }
}

function replayFacts(facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): ReplayState {
  let replay: ReplayState | null = null

  try {
    validateReplayJournal(facts)
    const creation = facts[0]
    if (creation.type !== 'match.created') throw new SparringMatchReplayError('Journal must begin with match.created')
    if (creation.matchId !== creation.payload.matchId) throw new SparringMatchReplayError('Creation fact identity mismatch')
    parseRegisteredGameKeyForReplay(creation.payload.gameKey)

    replay = {
      snapshot: createInitialSnapshot(creation.payload),
      gameplay: null,
      pendingCompletion: null,
    }

    const batches = groupReplayBatches(facts)
    let terminal = false
    let previousFact: StoredMatchFact | undefined

    for (const batch of batches) {
      if (terminal) throw new SparringMatchReplayError('Facts must not follow terminal match.ended')
      validateReplayBatch(batch)
      for (const fact of batch) {
        if (fact.type === 'match.created') {
          previousFact = fact
          continue
        }
        applyReplayFact(replay, fact, previousFact)
        previousFact = fact
        if (fact.type === 'match.ended') terminal = true
      }
      if (replay.pendingCompletion) {
        throw new SparringMatchReplayError('Missing expected frame.completed after outcome-producing game command')
      }
    }

    const finalLifecycle = projectLifecycleState(replay.snapshot)
    if (finalLifecycle.phase === 'match-over' && facts.at(-1)?.type !== 'match.ended') {
      throw new SparringMatchReplayError('Missing terminal match.ended fact')
    }

    return replay
  } catch (caught) {
    if (replay) disposeReplayGameplay(replay)
    throw toReplayError(caught instanceof Error ? caught : new SparringMatchReplayError('Replay failed'), 'Replay failed')
  }
}

function createPreparedLifecycleEvidence(
  previousSnapshot: SparringMatchSnapshot,
  lifecycleEvents: readonly SparringMatchLifecycleEvent[],
): PreparedLifecycleEvidence {
  return {
    previousSnapshot,
    candidateSnapshot: previewLifecycleEvents(previousSnapshot, lifecycleEvents),
  }
}

function runtimeReplayState(runtime: SessionRuntime): ReplayState {
  return {
    snapshot: runtime.actor.getSnapshot(),
    gameplay: runtime.gameplay,
    pendingCompletion: null,
  }
}

class ConcreteSparringMatchSession implements SparringMatchSession {
  private readonly ownerId = Symbol('sparring-match-session')
  private runtime: SessionRuntime
  private revision = 0
  private disposed = false
  private unusable = false

  private constructor(runtime: SessionRuntime) {
    activeSparringSessionOwners.add(this.ownerId)
    this.runtime = runtime
  }

  get state(): SparringMatchState {
    this.assertActive()
    return buildSparringMatchState(runtimeReplayState(this.runtime))
  }

  decide(command: SparringMatchCommand): SparringMatchDecision {
    this.assertActive()
    const lifecycle = projectLifecycleState(this.runtime.actor.getSnapshot())

    if (lifecycle.phase === 'match-over') {
      return { _tag: 'rejected', reason: { code: 'match-already-over' } }
    }

    switch (command.type) {
      case 'frame.start':
        return this.decideFrameStart(lifecycle)
      case 'frame.commence':
        return this.decideFrameCommence(lifecycle, command.seat)
      case 'frame.concede':
        return this.decideFrameConcede(lifecycle, command.seat)
      case 'game.command':
        return this.decideGameCommand(lifecycle, command.commandType, command.command)
    }
  }

  applyCommitted(transition: PreparedSparringMatchTransition, facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): void {
    this.assertActive()

    const record = readPreparedSparringTransition(transition)
    if (!activeSparringSessionOwners.has(record.ownerId)) {
      throw new InvalidSparringPreparedTransitionError('Prepared transition owner is no longer active')
    }
    if (record.ownerId !== this.ownerId) throw new InvalidSparringPreparedTransitionError('Prepared transition owner mismatch')
    if (record.consumed) throw new InvalidSparringPreparedTransitionError('Prepared transition was already consumed')
    if (record.revision !== this.revision)
      throw new InvalidSparringPreparedTransitionError('Prepared transition revision is stale')

    if (facts.length !== record.drafts.length) {
      throw new InvalidSparringPreparedTransitionError('Committed fact count does not match prepared drafts')
    }

    for (let index = 0; index < record.drafts.length; index += 1) {
      const draft = record.drafts[index]
      const fact = facts[index]
      if (!draft || !fact || !draftMatchesFact(draft, fact)) {
        throw new InvalidSparringPreparedTransitionError('Committed facts do not match prepared drafts')
      }
    }

    const matchId = facts[0].matchId
    const occurredAt = facts[0].occurredAt
    const causedByCommandId = facts[0].causedByCommandId

    for (let index = 0; index < facts.length; index += 1) {
      const fact = facts[index]
      if (!fact) throw new InvalidSparringPreparedTransitionError('Missing committed fact')
      if (fact.matchId !== matchId) throw new InvalidSparringPreparedTransitionError('Committed batch match ID mismatch')
      if (fact.occurredAt !== occurredAt)
        throw new InvalidSparringPreparedTransitionError('Committed batch occurrence time mismatch')
      if (index > 0 && fact.seq !== facts[index - 1]!.seq + 1) {
        throw new InvalidSparringPreparedTransitionError('Committed batch sequence is not contiguous')
      }
      if (fact.causedByCommandId !== causedByCommandId) {
        throw new InvalidSparringPreparedTransitionError('Committed batch command causation mismatch')
      }
    }

    const sessionMatchId = projectLifecycleState(this.runtime.actor.getSnapshot()).config.matchId
    if (matchId !== sessionMatchId) {
      throw new InvalidSparringPreparedTransitionError('Committed batch match ID does not match session match ID')
    }

    try {
      const currentSnapshot = this.runtime.actor.getSnapshot()
      if (!sparringSnapshotsEqual(currentSnapshot, record.machineEvidence.previousSnapshot)) {
        throw new InvalidSparringPreparedTransitionError('Prepared transition previous snapshot mismatch')
      }

      if (record.gameplayTransition) {
        if (!this.runtime.gameplay) {
          throw new InvalidSparringPreparedTransitionError('Missing gameplay session for prepared game transition')
        }
        this.runtime.gameplay.applyCommitted(record.gameplayTransition)
      }

      for (const event of record.lifecycleEvents) {
        this.runtime.actor.send(event)
      }

      const actualSnapshot = this.runtime.actor.getSnapshot()
      if (!sparringSnapshotsEqual(actualSnapshot, record.machineEvidence.candidateSnapshot)) {
        this.invalidateAfterApplyFailure('Post-commit sparring candidate snapshot mismatch')
      }

      if (record.createGameplayOnApply) {
        const lifecycle = projectLifecycleState(this.runtime.actor.getSnapshot())
        const gameKey = parseRegisteredGameKey(lifecycle.config.gameKey)
        this.runtime.gameplay = createGameplaySession(gameKey, record.createGameplayOnApply)
      }

      if (record.disposeGameplayAfterApply) {
        this.runtime.gameplay?.dispose()
        this.runtime.gameplay = null
      }
    } catch (error) {
      if (!this.unusable) {
        this.unusable = true
        this.runtime.gameplay?.dispose()
        this.runtime.gameplay = null
        this.runtime.actor.stop()
        activeSparringSessionOwners.delete(this.ownerId)
      }
      throw error
    }

    record.consumed = true
    this.revision += 1
  }

  project(latestSeq: number): SparringMatchRoomProjection {
    this.assertActive()
    const state = this.state
    const gameKey = parseRegisteredGameKey(state.config.gameKey)
    const snapshotBase = snapshotBaseFromState(state, latestSeq)
    const matchControls = deriveMatchControlSections(state)
    const gameControls = this.runtime.gameplay?.deriveControl()
    const controlSections = mergeControlCommandSections(matchControls, gameControls?.details.commandSections)

    return projectRoom(gameKey, snapshotBase, this.runtime.gameplay, controlSections)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unusable = true
    this.runtime.gameplay?.dispose()
    this.runtime.gameplay = null
    this.runtime.actor.stop()
    activeSparringSessionOwners.delete(this.ownerId)
  }

  private decideFrameStart(lifecycle: ReturnType<typeof projectLifecycleState>): SparringMatchDecision {
    if (lifecycle.phase !== 'between-frames') {
      return { _tag: 'rejected', reason: { code: 'frame-already-active' } }
    }

    const config = lifecycle.config
    const frameIndex = lifecycle.nextFrameIndex
    const breakerSeat = frameIndex % 2 === 1 ? config.firstBreakerSeat : opponentOf(config.firstBreakerSeat)
    const draft = {
      type: 'frame.started',
      payload: {
        frameIndex,
        gameKey: config.gameKey,
        targetPointsBySeat: config.targets.frameTargetPointsBySeat,
        breakerSeat,
        gameConfiguration: config.gameConfiguration,
      },
    } satisfies MatchFactDraft

    const lifecycleEvents = [{ type: 'frame.started', frameIndex, breakerSeat }] satisfies SparringMatchLifecycleEvent[]
    const previousSnapshot = this.runtime.actor.getSnapshot()
    const transition = createPreparedSparringTransition({
      ownerId: this.ownerId,
      revision: this.revision,
      drafts: [draft],
      lifecycleEvents,
      machineEvidence: createPreparedLifecycleEvidence(previousSnapshot, lifecycleEvents),
      gameplayTransition: null,
      createGameplayOnApply: gameplayArgsFromConfig(config, breakerSeat),
      disposeGameplayAfterApply: false,
    })

    return { _tag: 'accepted', facts: [draft], transition }
  }

  private decideFrameCommence(lifecycle: ReturnType<typeof projectLifecycleState>, seat: Seat): SparringMatchDecision {
    if (lifecycle.phase !== 'frame-in-progress' || !this.runtime.gameplay) {
      return { _tag: 'rejected', reason: { code: 'no-active-frame' } }
    }

    const { activeFrame } = lifecycle
    if (seat !== activeFrame.breakerSeat) {
      return { _tag: 'rejected', reason: { code: 'wrong-breaker', expectedSeat: activeFrame.breakerSeat } }
    }

    const decision = this.runtime.gameplay.decide('frame.commence', { seat })
    if (decision._tag === 'rejected') {
      return { _tag: 'rejected', reason: { code: 'game-command-rejected', reason: decision.reason } }
    }

    const draft = {
      type: 'game.command',
      payload: {
        frameIndex: activeFrame.frameIndex,
        gameKey: lifecycle.config.gameKey,
        commandType: 'frame.commence',
        command: { seat },
        protocolEntries: [...decision.result.protocolEntries],
      },
    } satisfies MatchFactDraft

    const lifecycleEvents: SparringMatchLifecycleEvent[] = []
    const previousSnapshot = this.runtime.actor.getSnapshot()
    const transition = createPreparedSparringTransition({
      ownerId: this.ownerId,
      revision: this.revision,
      drafts: [draft],
      lifecycleEvents,
      machineEvidence: createPreparedLifecycleEvidence(previousSnapshot, lifecycleEvents),
      gameplayTransition: decision.transition,
      createGameplayOnApply: null,
      disposeGameplayAfterApply: false,
    })

    return { _tag: 'accepted', facts: [draft], transition }
  }

  private decideFrameConcede(lifecycle: ReturnType<typeof projectLifecycleState>, seat: Seat): SparringMatchDecision {
    if (lifecycle.phase !== 'frame-in-progress' || !this.runtime.gameplay) {
      return { _tag: 'rejected', reason: { code: 'no-active-frame' } }
    }

    const { activeFrame, config, framesWonBySeat } = lifecycle
    const score = this.runtime.gameplay.deriveSummary().score
    const outcome: FrameOutcome = {
      winnerSeat: opponentOf(seat),
      score,
      winReason: 'conceded',
    }

    const drafts: MatchFactDraft[] = []
    appendCompletionDrafts({
      config,
      frameIndex: activeFrame.frameIndex,
      outcome,
      framesWonBySeat,
      drafts,
    })

    const lifecycleEvents: SparringMatchLifecycleEvent[] = [
      { type: 'frame.completed', frameIndex: activeFrame.frameIndex, outcome },
    ]
    const preparedDrafts = nonemptyDrafts(drafts)
    const previousSnapshot = this.runtime.actor.getSnapshot()
    const transition = createPreparedSparringTransition({
      ownerId: this.ownerId,
      revision: this.revision,
      drafts: preparedDrafts,
      lifecycleEvents,
      machineEvidence: createPreparedLifecycleEvidence(previousSnapshot, lifecycleEvents),
      gameplayTransition: null,
      createGameplayOnApply: null,
      disposeGameplayAfterApply: true,
    })

    return { _tag: 'accepted', facts: preparedDrafts, transition }
  }

  private decideGameCommand(
    lifecycle: ReturnType<typeof projectLifecycleState>,
    commandType: string,
    command: ControlCommandPayload,
  ): SparringMatchDecision {
    if (lifecycle.phase !== 'frame-in-progress' || !this.runtime.gameplay) {
      return { _tag: 'rejected', reason: { code: 'no-active-frame' } }
    }

    const decision = this.runtime.gameplay.decide(commandType, command)
    if (decision._tag === 'rejected') {
      return { _tag: 'rejected', reason: { code: 'game-command-rejected', reason: decision.reason } }
    }

    const { activeFrame, config, framesWonBySeat } = lifecycle
    const drafts: MatchFactDraft[] = [
      {
        type: 'game.command',
        payload: {
          frameIndex: activeFrame.frameIndex,
          gameKey: config.gameKey,
          commandType,
          command,
          protocolEntries: [...decision.result.protocolEntries],
        },
      },
    ]

    const lifecycleEvents: SparringMatchLifecycleEvent[] = []
    let disposeGameplayAfterApply = false

    if (decision.result.outcome) {
      appendCompletionDrafts({
        config,
        frameIndex: activeFrame.frameIndex,
        outcome: decision.result.outcome,
        framesWonBySeat,
        drafts,
      })
      lifecycleEvents.push({
        type: 'frame.completed',
        frameIndex: activeFrame.frameIndex,
        outcome: decision.result.outcome,
      })
      disposeGameplayAfterApply = true
    }

    const preparedDrafts = nonemptyDrafts(drafts)
    const previousSnapshot = this.runtime.actor.getSnapshot()
    const transition = createPreparedSparringTransition({
      ownerId: this.ownerId,
      revision: this.revision,
      drafts: preparedDrafts,
      lifecycleEvents,
      machineEvidence: createPreparedLifecycleEvidence(previousSnapshot, lifecycleEvents),
      gameplayTransition: decision.transition,
      createGameplayOnApply: null,
      disposeGameplayAfterApply,
    })

    return { _tag: 'accepted', facts: preparedDrafts, transition }
  }

  private invalidateAfterApplyFailure(message: string): never {
    if (!this.unusable) {
      this.unusable = true
      this.runtime.gameplay?.dispose()
      this.runtime.gameplay = null
      this.runtime.actor.stop()
      activeSparringSessionOwners.delete(this.ownerId)
    }
    throw new SparringMatchSessionUnusableError(message)
  }

  private assertActive(): void {
    if (this.disposed) throw new SparringMatchSessionDisposedError()
    if (this.unusable) throw new SparringMatchSessionUnusableError('Sparring match session is unusable after apply failure')
  }

  static fromConfig(config: MatchConfig): ConcreteSparringMatchSession {
    return new ConcreteSparringMatchSession({
      actor: createSparringMatchActor(config),
      gameplay: null,
    })
  }

  static fromReplay(replay: ReplayState): ConcreteSparringMatchSession {
    return new ConcreteSparringMatchSession({
      actor: createSparringMatchActorFromSnapshot(replay.snapshot),
      gameplay: replay.gameplay,
    })
  }
}

export function parseSparringMatchCommand(command: ControlCommand): ParseSparringMatchCommandResult {
  if (command.source === 'match') {
    switch (command.commandType) {
      case 'frame.start':
        return { _tag: 'parsed', command: { type: 'frame.start' } }
      case 'frame.commence': {
        const parsed = v.safeParse(v.object({ seat: SeatSchema }), command.command)
        if (!parsed.success) {
          return {
            _tag: 'parse-failed',
            reason: { code: 'unsupported-match-command', commandType: command.commandType },
          }
        }
        return { _tag: 'parsed', command: { type: 'frame.commence', seat: parsed.output.seat } }
      }
      case 'frame.concede': {
        const parsed = v.safeParse(v.object({ seat: SeatSchema }), command.command)
        if (!parsed.success) {
          return {
            _tag: 'parse-failed',
            reason: { code: 'unsupported-match-command', commandType: command.commandType },
          }
        }
        return { _tag: 'parsed', command: { type: 'frame.concede', seat: parsed.output.seat } }
      }
      default:
        return {
          _tag: 'parse-failed',
          reason: { code: 'unsupported-match-command', commandType: command.commandType },
        }
    }
  }

  if (command.source === 'game') {
    return {
      _tag: 'parsed',
      command: { type: 'game.command', commandType: command.commandType, command: command.command },
    }
  }

  return {
    _tag: 'parse-failed',
    reason: { code: 'unsupported-match-command', commandType: command.commandType },
  }
}

export function draftSparringMatchCreation(config: MatchConfig): Extract<MatchFactDraft, { type: 'match.created' }> {
  parseRegisteredGameKey(config.gameKey)
  return { type: 'match.created', payload: config }
}

export function restoreSparringMatchSession(facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): SparringMatchSession {
  const replay = replayFacts(facts)
  return ConcreteSparringMatchSession.fromReplay(replay)
}

export function replaySparringMatch(facts: readonly [StoredMatchFact, ...StoredMatchFact[]]): SparringMatchState {
  const replay = replayFacts(facts)
  try {
    return buildSparringMatchState(replay)
  } finally {
    disposeReplayGameplay(replay)
  }
}

export function createSparringMatchSession(config: MatchConfig): SparringMatchSession {
  parseRegisteredGameKey(config.gameKey)
  return ConcreteSparringMatchSession.fromConfig(config)
}
