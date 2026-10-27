import { GameKey } from '@ks/gameplay/definitions'
import * as v from 'valibot'

import { scoreboardSize } from '@/features/scoreboard/present/present'
import type { ScoreboardCentre, ScoreboardSize } from '@/features/scoreboard/values'

/** Add a layout here and in `LAYOUTS`; the page URL validates against this list. */
export const ScoreboardLayout = v.picklist(['compact', 'wide'])

export type ScoreboardLayout = v.InferOutput<typeof ScoreboardLayout>

/** Size of the stage every layout is designed on; consumers scale it to their source. */
export const SCOREBOARD_STAGE = { width: 1920, height: 1080 } as const

/**
 * Fixed box of a layout for one game, bottom-anchored and centred on the stage. It depends only on
 * the layout and the game's size, never on state, so a consumer can composite the artwork as one
 * image at a known position. It includes the ball row and the reserved secondary row.
 */
export function scoreboardBox(layout: ScoreboardLayout, size: ScoreboardSize) {
  const { width, height } = artworkGeometry(layout, size, null)

  return { x: (SCOREBOARD_STAGE.width - width) / 2, y: SCOREBOARD_STAGE.height - height, width, height }
}

/**
 * The stage area a layout's page shows, so an OBS source can be sized to it rather than the full
 * stage: the union of the layout's boxes across games, so one source size fits every match.
 */
export function scoreboardSourceArea(layout: ScoreboardLayout) {
  const boxes = GameKey.options.map((gameKey) => scoreboardBox(layout, scoreboardSize(gameKey)))
  const width = Math.max(...boxes.map((box) => box.width))
  const height = Math.max(...boxes.map((box) => box.height))

  return { x: (SCOREBOARD_STAGE.width - width) / 2, y: SCOREBOARD_STAGE.height - height, width, height }
}

/** The digit advances below are measured for these system UI fonts. */
export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'

/**
 * Strila's ball row spans about half the stage, like the club's previous scoreboard. The ball(s)
 * on are larger.
 */
export const BALL = { radius: 36, objectRadius: 46, pitch: 120, rowHeight: 96 } as const

/** Primary plus secondary row, below the ball row when the game has one. */
export const ROWS_HEIGHT = 96

/** Glyph advances of the system UI fonts' tabular digits, parentheses, and colon, as a share of the font size. */
const DIGIT = 0.58

const PAREN = 0.33

const COLON = 0.3

/** Equal space around each number of the centre: `_1_(3)_0_`. */
export const CENTRE_GAP = 16

/**
 * Fixed per-layout measures. Each name plate ends before a reserved breaker slot beside the
 * points box. Names and tips align to the inner edge and are clipped, never fitted.
 */
const LAYOUTS = {
  compact: {
    /** Seat side of the bar: name plate, edge padding, and breaker slot. */
    side: 450,
    edge: 20,
    breakerSlot: 28,
    radius: 12,
    primaryHeight: 60,
    fonts: { name: 28, target: 22, points: 40, count: 36, race: 24, tip: 20 },
    tipBaseline: 83,
  },
  wide: {
    side: null,
    edge: 48,
    breakerSlot: 36,
    radius: 0,
    primaryHeight: 62,
    fonts: { name: 34, target: 26, points: 44, count: 38, race: 26, tip: 24 },
    tipBaseline: 86,
  },
} as const

export type Geometry = ReturnType<typeof artworkGeometry>

/**
 * Positions for one layout and game. The box fits the widest centre the game can show, so it never
 * changes with state. Given a match's centre, the centre hugs that match's numbers: the compact bar
 * narrows with it and stays centred in the box, while the wide bar always spans the stage and its
 * name plates take the space.
 */
export function artworkGeometry(
  layout: ScoreboardLayout,
  size: ScoreboardSize,
  centre: ScoreboardCentre | null,
) {
  const l = LAYOUTS[layout]
  const even = (value: number) => 2 * Math.ceil(value / 2)
  const points = even(size.pointChars * DIGIT * l.fonts.points + 20)
  const countWidth = (digits: number) => digits * DIGIT * l.fonts.count

  // Equal gaps around each number (`_1_(3)_0_`). The colon has no padding of its own: the points
  // boxes' inner space separates it.
  const centreWidth = (kind: ScoreboardCentre['kind'], digits: number) => {
    switch (kind) {
      case 'frames':
        return even(2 * countWidth(digits) + (digits * DIGIT + 2 * PAREN) * l.fonts.race + 4 * CENTRE_GAP)
      case 'target':
        return even(countWidth(digits) + 2 * CENTRE_GAP)
      case 'separator':
        return even(COLON * l.fonts.points)
    }

    throw new Error('Unhandled scoreboard centre', { cause: kind satisfies never })
  }

  const boxCentre = centreWidth(size.centre.kind, size.centre.digits)
  const width = l.side === null ? SCOREBOARD_STAGE.width : 2 * l.side + 2 * points + boxCentre
  const digits = centre === null ? size.centre.digits : centreDigits(centre)
  const inner = centreWidth(centre?.kind ?? size.centre.kind, digits)

  const bar =
    l.side === null ? { x: 0, width } : { x: (boxCentre - inner) / 2, width: width - boxCentre + inner }

  const side = (bar.width - 2 * points - inner) / 2
  const right = bar.x + bar.width
  const top = size.ballRow ? BALL.rowHeight : 0

  return {
    ...l,
    width,
    height: top + ROWS_HEIGHT,
    top,
    /** Bottom of the primary row, where the secondary row starts. */
    row: top + l.primaryHeight,
    bar: { ...bar, side },
    namePlates: {
      A: { from: bar.x + l.edge, to: bar.x + side - l.breakerSlot },
      B: { from: right - side + l.breakerSlot, to: right - l.edge },
    },
    pointsBoxes: { A: { x: bar.x + side, width: points }, B: { x: right - side - points, width: points } },
    centre: { x: bar.x + side + points, width: inner, countWidth: countWidth(digits) },
  }
}

/** Frames won never exceed the race, so a frames centre keeps one width all match. */
function centreDigits(centre: ScoreboardCentre) {
  switch (centre.kind) {
    case 'frames':
      return String(centre.race).length
    case 'target':
      return String(centre.target).length
    case 'separator':
      return 0
  }

  throw new Error('Unhandled scoreboard centre', { cause: centre satisfies never })
}

/** Approximates the cap-height centre for the system UI fonts, which `dominant-baseline` renders unevenly. */
export function baseline(mid: number, fontSize: number) {
  return Math.round(mid + fontSize * 0.36)
}

/**
 * The bar's outline: the primary row, extended down under each name plate while its player has a
 * tip, and under the points boxes and centre while the target row shows. One path keeps the
 * translucent fill even where the rows meet.
 */
export function barOutline(g: Geometry, tips: { A: boolean; B: boolean }, targets: boolean) {
  const { x, width, side } = g.bar
  const r = g.radius
  const y = g.top
  const bottom = y + ROWS_HEIGHT
  const right = x + width
  const inner = { A: x + side, B: right - side }
  const depth = (deep: boolean) => (deep ? bottom : g.row)

  // Bottom profile from right to left, merging neighbours of equal depth.
  const runs: { from: number; to: number; y: number }[] = []

  for (const run of [
    { from: inner.B, to: right, y: depth(tips.B) },
    { from: inner.A, to: inner.B, y: depth(targets) },
    { from: x, to: inner.A, y: depth(tips.A) },
  ]) {
    const last = runs.at(-1)

    if (last?.y === run.y) last.from = run.from
    else runs.push(run)
  }

  const path = [
    `M${x} ${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    `H${right - r}`,
    `Q${right} ${y} ${right} ${y + r}`,
  ]

  const first = runs[0]

  path.push(`V${first.y - r}`, `Q${right} ${first.y} ${right - r} ${first.y}`)

  for (const [index, run] of runs.entries()) {
    if (index === 0) continue
    const b = run.to
    const from = runs[index - 1].y
    const to = run.y

    // Only the outer (convex) corners are rounded; inner corners stay square.
    path.push(
      ...(to > from
        ? [`H${b}`, `V${to - r}`, `Q${b} ${to} ${b - r} ${to}`]
        : [`H${b + r}`, `Q${b} ${from} ${b} ${from - r}`, `V${to}`]),
    )
  }

  const last = runs.at(-1)!

  path.push(`H${x + r}`, `Q${x} ${last.y} ${x} ${last.y - r}`, 'Z')

  return path.join(' ')
}
