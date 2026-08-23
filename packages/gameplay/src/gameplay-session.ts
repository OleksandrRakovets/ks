import { type FrameOutcome, type ProtocolEntry } from '@ks/core'
import * as v from 'valibot'

import type { GameCreateStateArgs } from './constants'
import type {
  ControlProjectionFor,
  GameCommandFor,
  GameStateFor,
  RegisteredGameKey,
  ScoreboardProjectionFor,
  SummaryProjectionFor,
} from './registry'

export const GameCommandRejectionSchema = v.object({
  code: v.literal('command-not-available'),
})

export type GameCommandRejection = v.InferOutput<typeof GameCommandRejectionSchema>

const PreparedGameTransitionBrand = Symbol('PreparedGameTransitionBrand')

export type PreparedGameTransition<K extends RegisteredGameKey> = {
  readonly gameKey: K
  readonly [PreparedGameTransitionBrand]: true
}

export type PreparedGameCommandResult<K extends RegisteredGameKey> = {
  readonly state: GameStateFor<K>
  readonly outcome?: FrameOutcome | undefined
  readonly protocolEntries: readonly ProtocolEntry[]
}

export type GameCommandDecision<K extends RegisteredGameKey> =
  | {
      readonly _tag: 'accepted'
      readonly result: PreparedGameCommandResult<K>
      readonly transition: PreparedGameTransition<K>
    }
  | {
      readonly _tag: 'rejected'
      readonly reason: GameCommandRejection
    }

export interface GameplaySession<K extends RegisteredGameKey> {
  readonly gameKey: K
  readonly state: GameStateFor<K>

  decide(command: GameCommandFor<K>): GameCommandDecision<K>

  applyCommitted(transition: PreparedGameTransition<K>): PreparedGameCommandResult<K>

  deriveControl(): ControlProjectionFor<K>
  deriveSummary(): SummaryProjectionFor<K>
  deriveScoreboard(): ScoreboardProjectionFor<K>
  dispose(): void
}

export type GameplaySessionFactoryArgs = GameCreateStateArgs

const commandNotAvailable: GameCommandRejection = { code: 'command-not-available' }

export function rejectedDecision<K extends RegisteredGameKey>(): GameCommandDecision<K> {
  return { _tag: 'rejected', reason: commandNotAvailable }
}

type PreparedTransitionMachineEvidence = {
  readonly previousSnapshot: unknown
  readonly candidateSnapshot: unknown
}

type PreparedTransitionRecord<K extends RegisteredGameKey> = {
  readonly gameKey: K
  readonly ownerId: symbol
  readonly revision: number
  readonly previousState: GameStateFor<K>
  readonly parsedEvent: unknown
  readonly candidateResult: PreparedGameCommandResult<K>
  readonly machineEvidence?: PreparedTransitionMachineEvidence
  consumed: boolean
}

const preparedTransitionRecords = new WeakMap<object, PreparedTransitionRecord<RegisteredGameKey>>()
const activeSessionOwners = new Set<symbol>()

export function buildPreparedResult<K extends RegisteredGameKey>(
  state: GameStateFor<K>,
  protocolEntries: readonly ProtocolEntry[],
  outcome?: FrameOutcome,
): PreparedGameCommandResult<K> {
  if (outcome) {
    return { state, protocolEntries, outcome }
  }
  return { state, protocolEntries }
}

export function registerSessionOwner(ownerId: symbol): void {
  activeSessionOwners.add(ownerId)
}

export function unregisterSessionOwner(ownerId: symbol): void {
  activeSessionOwners.delete(ownerId)
}

export function createPreparedTransition<K extends RegisteredGameKey>(args: {
  gameKey: K
  ownerId: symbol
  revision: number
  previousState: GameStateFor<K>
  parsedEvent: unknown
  candidateResult: PreparedGameCommandResult<K>
  machineEvidence?: PreparedTransitionMachineEvidence
}): PreparedGameTransition<K> {
  const transition = {
    gameKey: args.gameKey,
    [PreparedGameTransitionBrand]: true as const,
  } satisfies PreparedGameTransition<K>
  const record: PreparedTransitionRecord<K> = args.machineEvidence
    ? {
        gameKey: args.gameKey,
        ownerId: args.ownerId,
        revision: args.revision,
        previousState: args.previousState,
        parsedEvent: args.parsedEvent,
        candidateResult: args.candidateResult,
        machineEvidence: args.machineEvidence,
        consumed: false,
      }
    : {
        gameKey: args.gameKey,
        ownerId: args.ownerId,
        revision: args.revision,
        previousState: args.previousState,
        parsedEvent: args.parsedEvent,
        candidateResult: args.candidateResult,
        consumed: false,
      }
  preparedTransitionRecords.set(transition, record)
  return transition
}

export function readPreparedTransition<K extends RegisteredGameKey>(
  transition: PreparedGameTransition<K>,
): PreparedTransitionRecord<K> {
  const record = preparedTransitionRecords.get(transition)
  if (!record || record.gameKey !== transition.gameKey) {
    throw new InvalidPreparedTransitionError('Prepared transition is invalid or expired')
  }
  // SAFETY: Record gameKey was checked against the typed transition carrier above.
  return record as PreparedTransitionRecord<K>
}

export function isSessionOwnerActive(ownerId: symbol): boolean {
  return activeSessionOwners.has(ownerId)
}

export function acceptDecision<K extends RegisteredGameKey>(
  result: PreparedGameCommandResult<K>,
  transition: PreparedGameTransition<K>,
): GameCommandDecision<K> {
  return { _tag: 'accepted', result, transition }
}

export class GameplaySessionDisposedError extends Error {
  constructor() {
    super('Gameplay session is disposed')
    this.name = 'GameplaySessionDisposedError'
  }
}

export class GameplaySessionUnusableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameplaySessionUnusableError'
  }
}

export class InvalidPreparedTransitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPreparedTransitionError'
  }
}
