import type { ClientEvent, MatchSnapshot } from '@ks/core'
import { MatchStateSchema, applyEvent, emptyState, toSnapshot, type MatchState } from '@ks/gameplay'

export type { MatchState }
export { MatchStateSchema }

export function emptyMatchState(): MatchState {
  return emptyState()
}

export function applyMatchEvent(state: MatchState, event: ClientEvent): MatchState {
  return applyEvent(state, event)
}

export function snapshotFromMatchState(state: MatchState, latestSeq: number): MatchSnapshot {
  return toSnapshot(state, latestSeq)
}

export function deriveMatchState(events: ClientEvent[], baseState: MatchState = emptyState()): MatchState {
  let state = baseState
  for (const event of events) {
    state = applyEvent(state, event)
  }
  return state
}

export function deriveMatchSnapshot(
  events: ClientEvent[],
  latestSeq: number,
  baseState: MatchState = emptyState(),
): MatchSnapshot {
  const state = deriveMatchState(events, baseState)
  return toSnapshot(state, latestSeq)
}
