import type { StrilaBall } from '@ks/gameplay/definitions'

export const STRILA_BALL_COLORS = {
  0: { background: '#F0EDE6', border: '#C0BDB5' },
  1: { background: '#C8102E', border: '#9E0E24' },
  2: { background: '#F5C518', border: '#C9A00E' },
  3: { background: '#00A550', border: '#008040' },
  4: { background: '#7B4F2E', border: '#5C3A1E' },
  5: { background: '#005EB8', border: '#004A92' },
  6: { background: '#E8729A', border: '#C85580' },
  7: { background: '#2A2A2A', border: '#555555' },
} satisfies Record<StrilaBall, { background: string; border: string }>
