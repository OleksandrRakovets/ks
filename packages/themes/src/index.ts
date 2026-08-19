export type ThemeId = 'club'
export type ThemeVars = Record<`--${string}`, string>
type Themes = { [K in ThemeId]: ThemeVars }

export const themes: Themes = {
  club: {
    '--ks-bg': '#0b1220',
    '--ks-fg': '#eef2ff',
    '--ks-accent': '#f59e0b',
    '--ks-muted': '#93a4c7',
  },
}
