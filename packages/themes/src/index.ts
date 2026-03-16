export type ThemeId = 'club'
export type ThemeVars = Record<`--${string}`, string>

export const themes: Record<ThemeId, ThemeVars> = {
  club: {
    '--ks-bg': '#0b1220',
    '--ks-fg': '#eef2ff',
    '--ks-accent': '#f59e0b',
    '--ks-muted': '#93a4c7',
  },
}
