import * as v from 'valibot'

import { DEFAULT_THEME } from '@/features/scoreboard/themes/default'

/**
 * Paint tokens of one scoreboard theme. Themes change colours and opacities only; geometry, fonts,
 * and radii belong to the layout, because the artwork's sizes are measured against them.
 */
export type ThemePalette = Readonly<{
  /** The bar and ball tray. */
  bar: string
  barOpacity: number
  /** Points boxes, the target row, and a separator centre. */
  raised: string
  text: string
  /** Targets and the handicap label. */
  dim: string
  /** The centre and tips. */
  accent: string
  onAccent: string
  /** The race in a frames centre. */
  onAccentDim: string
}>

/** Add a theme here and in `SCOREBOARD_THEMES`; the page URL validates against this list. */
export const ScoreboardTheme = v.picklist(['default'])

export type ScoreboardTheme = v.InferOutput<typeof ScoreboardTheme>

export const SCOREBOARD_THEMES = { default: DEFAULT_THEME } satisfies Record<ScoreboardTheme, ThemePalette>
