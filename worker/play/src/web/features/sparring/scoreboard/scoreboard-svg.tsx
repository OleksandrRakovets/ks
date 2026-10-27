import { opponentOf, type Seat } from '@ks/core'
import type { StrilaBall } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import { STRILA_BALL_PALETTE } from '@/components/strila-ball'
import type { ScoreboardSize, ScoreboardValues } from '@/features/sparring/scoreboard/presentation'

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

/** Glyph advances of the system UI fonts' tabular digits and parentheses, as a share of the font size. */
const DIGIT = 0.58

const PAREN = 0.33

/** Equal space around each number of the amber centre group: `_1_(3)_0_`. */
const CENTRE_GAP = 16

/**
 * Fixed per-layout measures. Each name ends before a reserved breaker/shooter slot beside the
 * points, with a fixed slot for a non-default target. Names and tips start at the name's edge and
 * clip at their end, never fitted. A tip extends its player's name box down; the points and centre
 * stay one row, kept free for frame history.
 */
const LAYOUTS = {
  compact: {
    /** Name side of the bar, including its edge padding and breaker slot. */
    side: 450,
    edge: 20,
    breakerSlot: 28,
    targetSlot: 56,
    radius: 12,
    primaryHeight: 60,
    fonts: { name: 28, target: 22, points: 40, count: 36, race: 24, tip: 20 },
    tipBaseline: 83,
    centreInset: 0,
  },
  wide: {
    side: null,
    edge: 48,
    breakerSlot: 36,
    targetSlot: 64,
    radius: 0,
    primaryHeight: 62,
    fonts: { name: 34, target: 26, points: 44, count: 38, race: 26, tip: 24 },
    tipBaseline: 86,
    centreInset: 6,
  },
} as const

/**
 * Positions for one layout and game. The box fits the widest centre group the game can show, so it
 * never changes with state. Given a match's centre, the amber group hugs that match's numbers: the
 * compact bar narrows with it and stays centred in the box, while the wide band always spans the
 * stage and its name boxes take the space.
 */
function geometry(
  layout: ScoreboardLayout,
  size: ScoreboardSize,
  centre: { countDigits: number; race: number | null } | null,
) {
  const l = LAYOUTS[layout]
  const even = (value: number) => 2 * Math.ceil(value / 2)
  const points = size.pointChars === null ? 0 : even(size.pointChars * DIGIT * l.fonts.points + 20)
  const countWidth = (countDigits: number) => countDigits * DIGIT * l.fonts.count
  const raceWidth = (raceDigits: number) => (raceDigits * DIGIT + 2 * PAREN) * l.fonts.race

  const amberWidth = (countDigits: number, raceDigits: number | null) =>
    even(
      2 * countWidth(countDigits) +
        (raceDigits === null ? 3 * CENTRE_GAP : raceWidth(raceDigits) + 4 * CENTRE_GAP),
    )

  const boxAmber = amberWidth(size.countDigits, size.raceDigits)
  const width = l.side === null ? SCOREBOARD_STAGE.width : 2 * l.side + 2 * points + boxAmber

  const countDigits = centre?.countDigits ?? size.countDigits

  const raceDigits =
    centre === null ? size.raceDigits : centre.race === null ? null : String(centre.race).length

  const amber = amberWidth(countDigits, raceDigits)

  const bar =
    l.side === null ? { x: 0, width } : { x: (boxAmber - amber) / 2, width: width - boxAmber + amber }

  const side = (bar.width - 2 * points - amber) / 2
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
    centre: { x: bar.x + side + points, width: amber, countWidth: countWidth(countDigits), pad: CENTRE_GAP },
  }
}

function MatchArtwork(props: { values: MatchValues; geometry: Geometry; colors: Colors; idPrefix: string }) {
  const { values, geometry: g, colors: c } = props
  const mid = g.top + g.primaryHeight / 2
  const loser = values.winnerSeat === null ? null : opponentOf(values.winnerSeat)
  const fade = (seat: Seat) => (seat === loser ? 0.5 : 1)
  const slot = values.targets ? g.targetSlot : 0

  const nameRegion = {
    A: { from: g.names.A.from, to: g.names.A.to - slot },
    B: { from: g.names.B.from + slot, to: g.names.B.to },
  }

  const clipId = (kind: 'name' | 'tip', seat: Seat) => `${props.idPrefix}-${kind}-${seat}`

  return (
    <>
      <defs>
        {SEATS.flatMap((seat) => [
          <clipPath key={`name-${seat}`} id={clipId('name', seat)}>
            <ClipRect region={nameRegion[seat]} y={g.top} height={g.primaryHeight} />
          </clipPath>,
          <clipPath key={`tip-${seat}`} id={clipId('tip', seat)}>
            <ClipRect
              region={g.names[seat]}
              y={g.top + g.primaryHeight}
              height={ROWS_HEIGHT - g.primaryHeight}
            />
          </clipPath>,
        ])}
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

      <path
        d={bandPath(g, { A: values.tips.A !== null, B: values.tips.B !== null })}
        fill={c.band}
        fillOpacity={c.bandOpacity}
      />

      {SEATS.map((seat) => (
        <g key={seat} opacity={fade(seat)}>
          <text
            x={nameRegion[seat].from}
            y={baseline(mid, g.fonts.name)}
            clipPath={`url(#${clipId('name', seat)})`}
            fill={c.text}
            fontSize={g.fonts.name}
            fontWeight={600}
          >
            {values.names[seat]}
          </text>
          {values.targets ? (
            <text
              x={seat === 'A' ? g.names.A.to : g.names.B.from}
              y={baseline(mid, g.fonts.name)}
              textAnchor={seat === 'A' ? 'end' : 'start'}
              fill={c.dim}
              fontSize={g.fonts.target}
              fontWeight={500}
            >
              ({values.targets[seat]})
            </text>
          ) : null}
          {values.points ? (
            <>
              <rect
                x={g.points[seat].x}
                y={g.top + g.centreInset}
                width={g.points[seat].width}
                height={g.primaryHeight - 2 * g.centreInset}
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
            </>
          ) : null}
          {values.tips[seat] === null ? null : (
            <text
              x={g.names[seat].from}
              y={g.top + g.tipBaseline}
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

      <rect
        x={g.centre.x}
        y={g.top + g.centreInset}
        width={g.centre.width}
        height={g.primaryHeight - 2 * g.centreInset}
        rx={g.centreInset}
        fill={c.amber}
      />
      {SEATS.map((seat) => (
        <text
          key={seat}
          x={
            seat === 'A'
              ? g.centre.x + g.centre.pad + g.centre.countWidth / 2
              : g.centre.x + g.centre.width - g.centre.pad - g.centre.countWidth / 2
          }
          y={baseline(mid, g.fonts.count)}
          textAnchor="middle"
          fill={c.onAmber}
          fontSize={g.fonts.count}
          fontWeight={700}
          opacity={fade(seat)}
        >
          {values.centre[seat]}
        </text>
      ))}
      {values.centre.race === null ? null : (
        <text
          x={g.centre.x + g.centre.width / 2}
          y={baseline(mid, g.fonts.race)}
          textAnchor="middle"
          fill={c.onAmberDim}
          fontSize={g.fonts.race}
          fontWeight={600}
        >
          ({values.centre.race})
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
 * tip. One path keeps the translucent fill even where the rows meet.
 */
function bandPath(g: Geometry, tips: { A: boolean; B: boolean }) {
  const { x, width, side } = g.bar
  const r = g.radius
  const y = g.top
  const row = y + g.primaryHeight
  const bottom = y + ROWS_HEIGHT
  const right = x + width
  const inner = { A: x + side, B: right - side }

  return [
    `M${x} ${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    `H${right - r}`,
    `Q${right} ${y} ${right} ${y + r}`,
    ...(tips.B
      ? [
          `V${bottom - r}`,
          `Q${right} ${bottom} ${right - r} ${bottom}`,
          `H${inner.B + r}`,
          `Q${inner.B} ${bottom} ${inner.B} ${bottom - r}`,
          `V${row + r}`,
          `Q${inner.B} ${row} ${inner.B - r} ${row}`,
        ]
      : [`V${row - r}`, `Q${right} ${row} ${right - r} ${row}`]),
    ...(tips.A
      ? [
          `H${inner.A + r}`,
          `Q${inner.A} ${row} ${inner.A} ${row + r}`,
          `V${bottom - r}`,
          `Q${inner.A} ${bottom} ${inner.A - r} ${bottom}`,
          `H${x + r}`,
          `Q${x} ${bottom} ${x} ${bottom - r}`,
        ]
      : [`H${x + r}`, `Q${x} ${row} ${x} ${row - r}`]),
    'Z',
  ].join(' ')
}
