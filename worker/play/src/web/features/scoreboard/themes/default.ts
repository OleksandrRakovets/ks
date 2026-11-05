import type { ThemePalette } from '@/features/scoreboard/themes/themes'

/** Club green-black with an amber centre, close to the app's dark theme. */
export const DEFAULT_THEME = {
  bar: '#0B1510',
  barOpacity: 0.92,
  raised: '#1B2B22',
  text: '#FFFFFF',
  dim: '#A7B3AC',
  accent: '#F4B740',
  onAccent: '#1A1406',
  onAccentDim: '#5C4513',
} as const satisfies ThemePalette
