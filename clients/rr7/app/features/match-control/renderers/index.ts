import type { JSX } from 'react'

import { GenericControlRenderer } from './generic-control-renderer'
import { PyramidControlRenderer } from './pyramid-control-renderer'
import { StrilaControlRenderer } from './strila-control-renderer'
import type { MatchControlRendererProps } from './types'

type ControlRenderer = (props: MatchControlRendererProps) => JSX.Element

const PYRAMID_KEYS = new Set(['free-pyramid', 'free-pyramid-long', 'combined-pyramid', 'combined-pyramid-old'])

export function resolveControlRenderer(gameKey: string): ControlRenderer {
  if (gameKey === 'strila-v2') return StrilaControlRenderer
  if (PYRAMID_KEYS.has(gameKey)) return PyramidControlRenderer
  return GenericControlRenderer
}

export type { GameControlProjection, HydratedMatchParticipants, MatchControlRendererProps } from './types'
