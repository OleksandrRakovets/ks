import type { GameKey, MatchConfig, MatchSnapshot, Seat } from '@ks/core'

export type MatchState = {
  config?: MatchConfig
  status: 'empty' | 'active' | 'finished'
  frames: {
    frameIndex: number
    pointsBySeat: { A: number; B: number }
    winnerSeat?: Seat
  }[]
  framesWonBySeat: { A: number; B: number }
  currentFrameIndex: number
}

export function emptyState(): MatchState {
  return {
    status: 'empty',
    frames: [],
    framesWonBySeat: { A: 0, B: 0 },
    currentFrameIndex: 0,
  }
}

export function toSnapshot(state: MatchState, latestSeq: number): MatchSnapshot {
  if (!state.config) {
    throw new Error('Cannot snapshot without config')
  }
  return {
    matchId: state.config.matchId,
    gameKey: state.config.gameKey,
    targets: state.config.targets,
    participants: state.config.participants,
    status: state.status === 'finished' ? 'finished' : 'active',
    currentFrameIndex: state.currentFrameIndex,
    framesWonBySeat: state.framesWonBySeat,
    frames: state.frames,
    latestSeq,
  }
}

export function getGameKey(state: MatchState): GameKey {
  if (!state.config) throw new Error('Missing match config')
  return state.config.gameKey
}
