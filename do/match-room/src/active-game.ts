import {
  deriveSparringControlSections,
  type GameControlContribution,
  type MatchSnapshotFor,
  type MatchState,
  snapshotFromMatchState,
} from '@ks/competition'
import type { ControlCommandPayload, ControlCommandSections, FrameOutcome, ProtocolEntry } from '@ks/core'
import type { ControlProjectionFor, GameStateFor, RegisteredGameKey, SummaryProjectionFor } from '@ks/gameplay/definitions'
import {
  applyGameCommand,
  createInitialGameState,
  deriveGameControl,
  deriveGameSummary,
  parseGameKey,
} from '@ks/gameplay/server'

export type ActiveGameState<K extends RegisteredGameKey> = { gameKey: K; state: GameStateFor<K> }
export type AnyActiveGameState = { [K in RegisteredGameKey]: ActiveGameState<K> }[RegisteredGameKey]
type AppliedActiveGame<K extends RegisteredGameKey> = {
  active: ActiveGameState<K>
  outcome?: FrameOutcome
  protocolEntries: ProtocolEntry[]
}
export type AnyAppliedActiveGame = { [K in RegisteredGameKey]: AppliedActiveGame<K> }[RegisteredGameKey]
type RoomSnapshotSuccessFor<K extends RegisteredGameKey> = {
  ok: true
  snapshot: MatchSnapshotFor<K>
  controlProjection: ControlProjectionFor<K> | undefined
  controlSections: ControlCommandSections
}
export type RoomSnapshotSuccess = {
  [K in RegisteredGameKey]: RoomSnapshotSuccessFor<K>
}[RegisteredGameKey]

export function createActiveGameState(
  gameKey: RegisteredGameKey,
  args: Parameters<typeof createInitialGameState>[1],
): AnyActiveGameState {
  switch (gameKey) {
    case 'strila-v2':
      return createForGame(gameKey, args)
    case 'free-pyramid':
      return createForGame(gameKey, args)
    case 'free-pyramid-long':
      return createForGame(gameKey, args)
    case 'combined-pyramid':
      return createForGame(gameKey, args)
    case 'combined-pyramid-old':
      return createForGame(gameKey, args)
  }
}

function createForGame<K extends RegisteredGameKey>(
  gameKey: K,
  args: Parameters<typeof createInitialGameState>[1],
): ActiveGameState<K> {
  return { gameKey, state: createInitialGameState(gameKey, args) }
}

export function applyActiveGameCommand(
  active: AnyActiveGameState,
  commandType: string,
  command: ControlCommandPayload,
): AnyAppliedActiveGame {
  switch (active.gameKey) {
    case 'strila-v2':
      return applyForGame(active, commandType, command)
    case 'free-pyramid':
      return applyForGame(active, commandType, command)
    case 'free-pyramid-long':
      return applyForGame(active, commandType, command)
    case 'combined-pyramid':
      return applyForGame(active, commandType, command)
    case 'combined-pyramid-old':
      return applyForGame(active, commandType, command)
  }
}

function applyForGame<K extends RegisteredGameKey>(
  active: ActiveGameState<K>,
  commandType: string,
  command: ControlCommandPayload,
): AppliedActiveGame<K> {
  const result = applyGameCommand({ gameKey: active.gameKey, state: active.state, commandType, command })
  const applied: AppliedActiveGame<K> = {
    active: { gameKey: active.gameKey, state: result.state },
    protocolEntries: result.protocolEntries,
  }
  if (result.outcome) applied.outcome = result.outcome
  return applied
}

export function deriveActiveGameControl<K extends RegisteredGameKey>(active: ActiveGameState<K>): ControlProjectionFor<K> {
  return deriveGameControl(active.gameKey, active.state)
}

export function deriveActiveGameSummary<K extends RegisteredGameKey>(active: ActiveGameState<K>): SummaryProjectionFor<K> {
  return deriveGameSummary(active.gameKey, active.state)
}

export function deriveRoomControlProjection<K extends RegisteredGameKey>(
  currentFrame: ActiveGameState<K> | null,
): ControlProjectionFor<K> | undefined {
  return currentFrame ? deriveActiveGameControl(currentFrame) : undefined
}

export function assembleRoomSnapshot(
  matchState: MatchState,
  currentFrame: AnyActiveGameState | null,
  latestSeq: number,
): RoomSnapshotSuccess {
  const config = matchState.config
  if (!config) throw new Error('Match is not initialized')
  const gameKey = parseGameKey(config.gameKey)
  switch (gameKey) {
    case 'strila-v2':
      return assembleForGame(gameKey, matchState, activeFrameFor(gameKey, currentFrame), latestSeq)
    case 'free-pyramid':
      return assembleForGame(gameKey, matchState, activeFrameFor(gameKey, currentFrame), latestSeq)
    case 'free-pyramid-long':
      return assembleForGame(gameKey, matchState, activeFrameFor(gameKey, currentFrame), latestSeq)
    case 'combined-pyramid':
      return assembleForGame(gameKey, matchState, activeFrameFor(gameKey, currentFrame), latestSeq)
    case 'combined-pyramid-old':
      return assembleForGame(gameKey, matchState, activeFrameFor(gameKey, currentFrame), latestSeq)
  }
}

function activeFrameFor<K extends RegisteredGameKey>(
  gameKey: K,
  currentFrame: AnyActiveGameState | null,
): ActiveGameState<K> | null {
  if (!currentFrame) return null
  if (currentFrame.gameKey !== gameKey) throw new Error('Active frame game key does not match match')
  // SAFETY: The tagged carrier's literal gameKey was checked against K above.
  return currentFrame as ActiveGameState<K>
}

function assembleForGame<K extends RegisteredGameKey>(
  gameKey: K,
  matchState: MatchState,
  currentFrame: ActiveGameState<K> | null,
  latestSeq: number,
): RoomSnapshotSuccessFor<K> {
  const snapshot = snapshotFromMatchState(matchState, latestSeq)
  if (snapshot.gameKey !== gameKey) throw new Error('Snapshot game key does not match match configuration')
  const controlProjection = deriveRoomControlProjection(currentFrame)
  const gameControl: GameControlContribution | undefined = controlProjection?.details
  const controlSections = gameControl
    ? deriveSparringControlSections({ matchState, gameControl })
    : deriveSparringControlSections({ matchState })
  return {
    ok: true,
    snapshot: { ...snapshot, gameKey },
    controlProjection,
    controlSections,
  }
}
