import type { JSX } from 'react'

import { PyramidControlRenderer } from './pyramid-control-renderer'
import { StrilaControlRenderer } from './strila-control-renderer'
import type { MatchControlRendererProps } from './types'

type ControlRenderer = (props: MatchControlRendererProps) => JSX.Element

const PYRAMID_KEYS = new Set(['free-pyramid', 'free-pyramid-long', 'combined-pyramid', 'combined-pyramid-old'])

export function resolveControlRenderer(gameKey: string): ControlRenderer {
  if (gameKey === 'strila-v2') return StrilaControlRenderer
  if (PYRAMID_KEYS.has(gameKey)) return PyramidControlRenderer
  throw new Error(`Unsupported control renderer for game key: ${gameKey}`)
}

export type { GameControlProjection, HydratedMatchParticipants } from './types'
