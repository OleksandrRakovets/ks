import type { ClientEvent, Seat } from '@ks/core'

import invariant from 'tiny-invariant'

import { getGameDefinition, type GameEffect } from './definitions'
import { emptyState, type MatchState } from './state'

function getOrCreateCurrentFrame(state: MatchState): MatchState['frames'][number] {
  const current = state.frames[state.frames.length - 1]
  invariant(current && current.frameIndex === state.currentFrameIndex, 'No active frame')
  invariant(!current.winnerSeat, 'Frame already awarded')
  return current
}

function applyScoreDelta(state: MatchState, seat: Seat, delta: number): void {
  const frame = getOrCreateCurrentFrame(state)
  frame.pointsBySeat[seat] += delta
}

function applyScoreSet(state: MatchState, seat: Seat, value: number): void {
  const frame = getOrCreateCurrentFrame(state)
  frame.pointsBySeat[seat] = value
}

function applyGameEffect(state: MatchState, effect: GameEffect): void {
  switch (effect.type) {
    case 'score.delta': {
      applyScoreDelta(state, effect.seat, effect.delta)
      return
    }
    case 'score.set': {
      applyScoreSet(state, effect.seat, effect.value)
      return
    }
  }
}

function applyLegacyScoreDelta(state: MatchState, seat: Seat, delta: number): void {
  invariant(state.config, 'Missing match config')

  const definition = getGameDefinition(state.config.gameKey)
  const { effects } = definition.reduceCommand(state, {
    commandType: 'shot.recorded',
    command: { seat, points: delta },
  })
  for (const effect of effects) {
    applyGameEffect(state, effect)
  }
}

function applyLegacyScoreSet(state: MatchState, seat: Seat, value: number): void {
  const frame = getOrCreateCurrentFrame(state)
  const delta = value - frame.pointsBySeat[seat]
  applyLegacyScoreDelta(state, seat, delta)
}

export function applyEvent(prev: MatchState, event: ClientEvent): MatchState {
  const state = prev.status === 'empty' ? emptyState() : prev

  switch (event.type) {
    case 'match.created': {
      return {
        config: event.payload,
        status: 'active',
        frames: [],
        framesWonBySeat: { A: 0, B: 0 },
        currentFrameIndex: 0,
      }
    }
    case 'frame.started': {
      invariant(state.status === 'active', 'Cannot start frame when not active')
      invariant(state.config, 'Missing match config')

      const { frameIndex } = event.payload
      const last = state.frames[state.frames.length - 1]
      invariant(!last || last.winnerSeat, 'Cannot start a new frame while current is unawarded')
      invariant(frameIndex === state.currentFrameIndex + 1, 'Frame index must be sequential')

      state.currentFrameIndex = frameIndex
      state.frames.push({ frameIndex, pointsBySeat: { A: 0, B: 0 } })
      return state
    }
    case 'score.delta': {
      invariant(state.status === 'active', 'Cannot score when not active')
      applyLegacyScoreDelta(state, event.payload.seat, event.payload.delta)
      return state
    }
    case 'score.set': {
      invariant(state.status === 'active', 'Cannot score when not active')
      applyLegacyScoreSet(state, event.payload.seat, event.payload.value)
      return state
    }
    case 'game.command': {
      invariant(state.status === 'active', 'Cannot apply game command when not active')
      invariant(state.config, 'Missing match config')
      invariant(event.payload.gameKey === state.config.gameKey, 'Game command key does not match match config')

      const definition = getGameDefinition(event.payload.gameKey)
      const { effects } = definition.reduceCommand(state, {
        commandType: event.payload.commandType,
        command: event.payload.command,
      })
      for (const effect of effects) {
        applyGameEffect(state, effect)
      }
      return state
    }
    case 'frame.awarded': {
      invariant(state.status === 'active', 'Cannot award frame when not active')
      const frame = state.frames.find((f) => f.frameIndex === event.payload.frameIndex)
      invariant(frame, 'Unknown frame')
      invariant(!frame.winnerSeat, 'Frame already awarded')
      frame.winnerSeat = event.payload.winnerSeat
      state.framesWonBySeat[event.payload.winnerSeat] += 1
      return state
    }
    case 'frame.reopened': {
      invariant(state.status === 'active', 'Cannot reopen frame when not active')
      const frameIndex = state.frames.findIndex((f) => f.frameIndex === event.payload.frameIndex)
      invariant(frameIndex >= 0, 'Unknown frame')

      const frame = state.frames[frameIndex]
      invariant(frame, 'Unknown frame')
      if (!frame.winnerSeat) return state
      state.framesWonBySeat[frame.winnerSeat] = Math.max(0, state.framesWonBySeat[frame.winnerSeat] - 1)

      const { winnerSeat: _winnerSeat, ...reopenedFrame } = frame
      state.frames[frameIndex] = reopenedFrame
      return state
    }
    case 'match.ended': {
      if (state.status !== 'active') return state
      state.status = 'finished'
      return state
    }
  }
}
