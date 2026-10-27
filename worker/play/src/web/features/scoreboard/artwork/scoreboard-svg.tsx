import { opponentOf, type Seat } from '@ks/core'
import { GameKey, type StrilaBall } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import { STRILA_BALL_PALETTE } from '@/components/strila-ball'
import {
  type ScoreboardCentre,
  type ScoreboardSize,
  scoreboardSize,
  type ScoreboardValues,
} from '@/features/scoreboard/present/present'

export type ScoreboardLayout = 'compact' | 'wide'

export type ScoreboardTheme = 'default'

/** Size of the stage every layout is designed on; consumers scale it to their frame. */
export const SCOREBOARD_STAGE = { width: 1920, height: 1080 } as const

/**
 * Fixed box of a layout for one game, bottom-anchored and centred on the stage. It depends only on
 * the layout and the game's size, never on state, so a consumer can composite the artwork as one
 * image at a known position. It includes the ball row and the reserved secondary row.
 */
export function scoreboardBox(layout: ScoreboardLayout, size: ScoreboardSize) {
  const { width, height } = geometry(layout, size, null)

  return { x: (SCOREBOARD_STAGE.width - width) / 2, y: SCOREBOARD_STAGE.height - height, width, height }
}

/**
 * The stage area a layout's page shows, so an OBS source can be sized to it rather than the full
 * frame: the union of the layout's boxes across games, so one source size fits every match.
 */
export function scoreboardFrame(layout: ScoreboardLayout) {
  const boxes = GameKey.options.map((gameKey) => scoreboardBox(layout, scoreboardSize(gameKey)))
  const width = Math.max(...boxes.map((box) => box.width))
  const height = Math.max(...boxes.map((box) => box.height))

  return { x: (SCOREBOARD_STAGE.width - width) / 2, y: SCOREBOARD_STAGE.height - height, width, height }
}

/**
 * The scoreboard artwork: one self-contained SVG using inline presentation attributes only, with
 * no stylesheet classes, foreignObject, external images, or web fonts, so it rasterizes the same
 * outside the page. It derives nothing from route params; the page positions and scales it.
 */
export function ScoreboardSvg(props: {
  values: ScoreboardValues
  layout: ScoreboardLayout
  theme: ScoreboardTheme
  locale: SupportedLocale
}) {
  const values = props.values
  const g = geometry(props.layout, values.size, values.kind === 'match' ? values.centre : null)
  const { width, height } = g

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      lang={props.locale}
      data-match-id={values.matchId}
      data-seq={values.kind === 'match' ? values.seq : undefined}
      fontFamily={FONT_FAMILY}
    >
      {values.kind === 'match' ? (
        <MatchArtwork
          values={values}
          geometry={g}
          colors={THEMES[props.theme]}
          idPrefix={`scoreboard-${props.layout}`}
        />
      ) : null}
    </svg>
  )
}

type MatchValues = Extract<ScoreboardValues, { kind: 'match' }>

type Colors = (typeof THEMES)[ScoreboardTheme]

type Geometry = ReturnType<typeof geometry>

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'

const THEMES = {
  default: {
    band: '#0B1510',
    bandOpacity: 0.92,
    raised: '#1B2B22',
    text: '#FFFFFF',
    dim: '#A7B3AC',
    amber: '#F4B740',
    onAmber: '#1A1406',
    onAmberDim: '#5C4513',
  },
} as const

/**
 * Strila's ball row spans about half the stage, like the club's previous scoreboard. The ball(s)
 * on are larger; potted balls are dimmed.
 */
const BALL = { radius: 36, objectRadius: 46, pitch: 120, rowHeight: 96 } as const

/** Bar plus the reserved secondary row, below the ball row when the game has one. */
const ROWS_HEIGHT = 96

/** Glyph advances of the system UI fonts' tabular digits, parentheses, and colon, as a share of the font size. */
const DIGIT = 0.58

const PAREN = 0.33

const COLON = 0.3

/** Equal space around each number of the amber centre group: `_1_(3)_0_`. */
const CENTRE_GAP = 16

/**
 * Fixed per-layout measures. Each name ends before a reserved breaker/shooter slot beside the
 * points. Names and tips align towards the centre, mirrored, and are clipped, never fitted. A tip
 * extends its player's name box down; per-seat targets extend the points and centre down.
 */
const LAYOUTS = {
  compact: {
    /** Name side of the bar, including its edge padding and breaker slot. */
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

/**
 * Positions for one layout and game. The box fits the widest centre the game can show, so it never
 * changes with state. Given a match's centre, the centre hugs that match's numbers: the compact bar
 * narrows with it and stays centred in the box, while the wide band always spans the stage and its
 * name boxes take the space.
 */
function geometry(layout: ScoreboardLayout, size: ScoreboardSize, centre: ScoreboardCentre | null) {
  const l = LAYOUTS[layout]
  const even = (value: number) => 2 * Math.ceil(value / 2)
  const points = even(size.pointChars * DIGIT * l.fonts.points + 20)
  const countWidth = (digits: number) => digits * DIGIT * l.fonts.count

  // Equal gaps around each number (`_1_(3)_0_`). The colon has no padding of its own: the points
  // boxes' inner space separates it.
  const centreWidth = (kind: ScoreboardCentre['kind'], digits: number) =>
    even(
      kind === 'frames'
        ? 2 * countWidth(digits) + (digits * DIGIT + 2 * PAREN) * l.fonts.race + 4 * CENTRE_GAP
        : kind === 'target'
          ? countWidth(digits) + 2 * CENTRE_GAP
          : COLON * l.fonts.points,
    )

  const boxCentre = centreWidth(size.centre.kind, size.centre.digits)
  const width = l.side === null ? SCOREBOARD_STAGE.width : 2 * l.side + 2 * points + boxCentre

  // Frames won never exceed the race, so a frames centre keeps one width all match.
  const digits =
    centre === null
      ? size.centre.digits
      : centre.kind === 'frames'
        ? String(centre.race).length
        : centre.kind === 'target'
          ? String(centre.target).length
          : 0

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
    bar: { ...bar, side },
    names: {
      A: { from: bar.x + l.edge, to: bar.x + side - l.breakerSlot },
      B: { from: right - side + l.breakerSlot, to: right - l.edge },
    },
    points: { A: { x: bar.x + side, width: points }, B: { x: right - side - points, width: points } },
    centre: { x: bar.x + side + points, width: inner, countWidth: countWidth(digits) },
  }
}

function MatchArtwork(props: { values: MatchValues; geometry: Geometry; colors: Colors; idPrefix: string }) {
  const { values, geometry: g, colors: c } = props
  const mid = g.top + g.primaryHeight / 2
  const row = g.top + g.primaryHeight
  const rowMid = (row + g.top + ROWS_HEIGHT) / 2
  const loser = values.winnerSeat === null ? null : opponentOf(values.winnerSeat)
  const fade = (seat: Seat) => (seat === loser ? 0.5 : 1)
  const centre = values.centre
  const band = bandPath(g, { A: values.tips.A !== null, B: values.tips.B !== null }, values.targets !== null)
  // Names and tips hug the centre on both sides, mirrored like a broadcast scoreboard.
  const inner = { A: g.names.A.to, B: g.names.B.from }
  const clipId = (kind: 'name' | 'tip', seat: Seat) => `${props.idPrefix}-${kind}-${seat}`

  return (
    <>
      <defs>
        {SEATS.flatMap((seat) => [
          <clipPath key={`name-${seat}`} id={clipId('name', seat)}>
            <ClipRect region={g.names[seat]} y={g.top} height={g.primaryHeight} />
          </clipPath>,
          <clipPath key={`tip-${seat}`} id={clipId('tip', seat)}>
            <ClipRect region={g.names[seat]} y={row} height={ROWS_HEIGHT - g.primaryHeight} />
          </clipPath>,
        ])}
        <clipPath id={`${props.idPrefix}-band`}>
          <path d={band} />
        </clipPath>
        {values.balls?.map(({ ball }) => (
          <radialGradient key={ball} id={`${props.idPrefix}-ball-${ball}`} cx="42%" cy="38%" r="62%">
            <stop offset="0%" stopColor={STRILA_BALL_PALETTE[ball].highlight} />
            <stop offset="54%" stopColor={STRILA_BALL_PALETTE[ball].base} />
            <stop offset="100%" stopColor={STRILA_BALL_PALETTE[ball].shade} />
          </radialGradient>
        ))}
        {values.balls ? (
          <radialGradient id={`${props.idPrefix}-shine`} cx="34%" cy="27%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.78} />
            <stop offset="8%" stopColor="#FFFFFF" stopOpacity={0.78} />
            <stop offset="10%" stopColor="#FFFFFF" stopOpacity={0.22} />
            <stop offset="34%" stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
        ) : null}
      </defs>

      {values.balls ? (
        <BallRow balls={values.balls} centreX={g.width / 2} colors={c} idPrefix={props.idPrefix} />
      ) : null}

      <path d={band} fill={c.band} fillOpacity={c.bandOpacity} />

      {/* Clipped to the band, so the raised boxes take its rounded outer corners. */}
      {SEATS.map((seat) => (
        <g key={seat} opacity={fade(seat)} clipPath={`url(#${props.idPrefix}-band)`}>
          <text
            x={inner[seat]}
            y={baseline(mid, g.fonts.name)}
            textAnchor={seat === 'A' ? 'end' : 'start'}
            clipPath={`url(#${clipId('name', seat)})`}
            fill={c.text}
            fontSize={g.fonts.name}
            fontWeight={600}
          >
            {values.names[seat]}
          </text>
          <rect
            x={g.points[seat].x}
            y={g.top}
            width={g.points[seat].width}
            height={values.targets ? ROWS_HEIGHT : g.primaryHeight}
            fill={c.raised}
          />
          <text
            x={g.points[seat].x + g.points[seat].width / 2}
            y={baseline(mid, g.fonts.points)}
            textAnchor="middle"
            fill={c.text}
            fontSize={g.fonts.points}
            fontWeight={700}
          >
            {values.points[seat]}
          </text>
          {values.targets ? (
            <text
              x={g.points[seat].x + g.points[seat].width / 2}
              y={baseline(rowMid, g.fonts.target)}
              textAnchor="middle"
              fill={c.dim}
              fontSize={g.fonts.target}
              fontWeight={600}
            >
              {values.targets[seat]}
            </text>
          ) : null}
          {values.tips[seat] === null ? null : (
            <text
              x={inner[seat]}
              y={g.top + g.tipBaseline}
              textAnchor={seat === 'A' ? 'end' : 'start'}
              clipPath={`url(#${clipId('tip', seat)})`}
              fill={c.amber}
              fontSize={g.fonts.tip}
              fontWeight={600}
            >
              {values.tips[seat].text}
            </text>
          )}
        </g>
      ))}

      {centre.kind === 'separator' ? (
        <>
          <rect
            x={g.centre.x}
            y={g.top}
            width={g.centre.width}
            height={values.targets ? ROWS_HEIGHT : g.primaryHeight}
            fill={c.raised}
          />
          {/* The colon sits low against the digits' cap height. */}
          <text
            x={g.centre.x + g.centre.width / 2}
            y={baseline(mid, g.fonts.points) - 3}
            textAnchor="middle"
            fill={c.text}
            fontSize={g.fonts.points}
            fontWeight={700}
          >
            :
          </text>
        </>
      ) : (
        <rect x={g.centre.x} y={g.top} width={g.centre.width} height={g.primaryHeight} fill={c.amber} />
      )}
      {centre.kind === 'target' ? (
        <text
          x={g.centre.x + g.centre.width / 2}
          y={baseline(mid, g.fonts.count)}
          textAnchor="middle"
          fill={c.onAmber}
          fontSize={g.fonts.count}
          fontWeight={700}
        >
          {centre.target}
        </text>
      ) : null}
      {centre.kind === 'frames' ? (
        <>
          {SEATS.map((seat) => (
            <text
              key={seat}
              x={
                seat === 'A'
                  ? g.centre.x + CENTRE_GAP + g.centre.countWidth / 2
                  : g.centre.x + g.centre.width - CENTRE_GAP - g.centre.countWidth / 2
              }
              y={baseline(mid, g.fonts.count)}
              textAnchor="middle"
              fill={c.onAmber}
              fontSize={g.fonts.count}
              fontWeight={700}
              opacity={fade(seat)}
            >
              {centre[seat]}
            </text>
          ))}
          <text
            x={g.centre.x + g.centre.width / 2}
            y={baseline(mid, g.fonts.race)}
            textAnchor="middle"
            fill={c.onAmberDim}
            fontSize={g.fonts.race}
            fontWeight={600}
          >
            ({centre.race})
          </text>
        </>
      ) : null}
      {values.targets === null || values.targets.label === null ? null : (
        <text
          x={g.centre.x + g.centre.width / 2}
          y={baseline(rowMid, g.fonts.tip)}
          textAnchor="middle"
          fill={c.dim}
          fontSize={g.fonts.tip}
          fontWeight={600}
        >
          {values.targets.label}
        </text>
      )}
    </>
  )
}

const SEATS = ['A', 'B'] as const

function ClipRect(props: { region: { from: number; to: number }; y: number; height: number }) {
  return (
    <rect
      x={props.region.from}
      y={props.y}
      width={props.region.to - props.region.from}
      height={props.height}
    />
  )
}

/** Mirrors the table: the ball(s) on are larger and potted balls are dimmed. */
function BallRow(props: {
  balls: NonNullable<MatchValues['balls']>
  centreX: number
  colors: Colors
  idPrefix: string
}) {
  const width = props.balls.length * BALL.pitch
  const left = props.centreX - width / 2
  const cy = BALL.rowHeight / 2

  return (
    <g>
      <rect
        x={left}
        y={0}
        width={width}
        height={BALL.rowHeight}
        rx={BALL.rowHeight / 2}
        fill={props.colors.band}
        fillOpacity={props.colors.bandOpacity}
      />
      {props.balls.map(({ ball, status }, index) => (
        <Ball
          key={ball}
          ball={ball}
          cx={left + BALL.pitch / 2 + index * BALL.pitch}
          cy={cy}
          status={status}
          idPrefix={props.idPrefix}
        />
      ))}
    </g>
  )
}

function Ball(props: {
  ball: StrilaBall
  cx: number
  cy: number
  status: NonNullable<MatchValues['balls']>[number]['status']
  idPrefix: string
}) {
  const r = props.status === 'object' ? BALL.objectRadius : BALL.radius

  return (
    <g opacity={props.status === 'potted' ? 0.22 : 1}>
      <circle cx={props.cx} cy={props.cy} r={r} fill={`url(#${props.idPrefix}-ball-${props.ball})`} />
      <circle cx={props.cx} cy={props.cy} r={r} fill={`url(#${props.idPrefix}-shine)`} />
    </g>
  )
}

/** Approximates the cap-height centre for the system UI fonts, which `dominant-baseline` renders unevenly. */
function baseline(mid: number, fontSize: number) {
  return Math.round(mid + fontSize * 0.36)
}

/**
 * The bar's outline: one row, extended down under each player's name box while that player has a
 * tip, and under the points and centre while per-seat targets show. One path keeps the translucent
 * fill even where the rows meet.
 */
function bandPath(g: Geometry, tips: { A: boolean; B: boolean }, targets: boolean) {
  const { x, width, side } = g.bar
  const r = g.radius
  const y = g.top
  const row = y + g.primaryHeight
  const bottom = y + ROWS_HEIGHT
  const right = x + width
  const inner = { A: x + side, B: right - side }
  const depth = (deep: boolean) => (deep ? bottom : row)

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
    const down = to > from ? 1 : -1

    // Only the outer (convex) corners are rounded; inner corners stay square.
    path.push(
      ...(down > 0
        ? [`H${b}`, `V${to - r}`, `Q${b} ${to} ${b - r} ${to}`]
        : [`H${b + r}`, `Q${b} ${from} ${b} ${from - r}`, `V${to}`]),
    )
  }

  const last = runs.at(-1)!

  path.push(`H${x + r}`, `Q${x} ${last.y} ${x} ${last.y - r}`, 'Z')

  return path.join(' ')
}
