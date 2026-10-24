import { opponentOf, type Seat } from '@ks/core'
import type { StrilaBall } from '@ks/gameplay/definitions'
import type { SupportedLocale } from '@ks/i18n'

import { STRILA_BALL_PALETTE } from '@/components/strila-ball'
import type { ScoreboardValues } from '@/features/sparring/scoreboard/presentation'

export type ScoreboardLayout = 'compact' | 'wide'

export type ScoreboardTheme = 'default'

/** Size of the stage every layout is designed on; consumers scale it to their frame. */
export const SCOREBOARD_STAGE = { width: 1920, height: 1080 } as const

/**
 * Fixed box and anchor of each layout on the stage. The box is constant across every state, so a
 * consumer can composite the artwork as one image at a known position. Both stay inside the bottom
 * ≈14% of the frame, below the near cushion and pockets in the club camera views.
 */
export const SCOREBOARD_BOXES = {
  compact: { x: 280, y: 930, width: 1360, height: 150 },
  wide: { x: 0, y: 930, width: 1920, height: 150 },
} as const satisfies Record<ScoreboardLayout, { x: number; y: number; width: number; height: number }>

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
  const { width, height } = SCOREBOARD_BOXES[props.layout]
  const values = props.values

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
          geometry={GEOMETRY[props.layout]}
          colors={THEMES[props.theme]}
          idPrefix={`scoreboard-${props.layout}`}
        />
      ) : null}
    </svg>
  )
}

type MatchValues = Extract<ScoreboardValues, { kind: 'match' }>

type Colors = (typeof THEMES)[ScoreboardTheme]

type Geometry = (typeof GEOMETRY)[ScoreboardLayout]

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'

const THEMES = {
  default: {
    band: '#0B1510',
    bandOpacity: 0.92,
    raised: '#1B2B22',
    tab: '#07100B',
    text: '#FFFFFF',
    dim: '#A7B3AC',
    amber: '#F4B740',
    onAmber: '#1A1406',
    onAmberDim: '#5C4513',
  },
} as const

const BALL = { radius: 15, pitch: 40, rowHeight: 44 } as const

/**
 * Per-layout positions. Each name ends before a reserved breaker/shooter slot beside the points,
 * with a fixed slot for a non-default target. Names and tips start at a fixed edge and are clipped
 * at their end, never fitted. Tips stop short of the centre, which stays free for frame history.
 * The wide band's secondary row is painted only while a tip shows.
 */
const GEOMETRY = {
  compact: {
    width: 1360,
    bar: { y: 50, radius: 12, tipsHeight: 60 },
    primaryHeight: 60,
    fonts: { name: 26, target: 22, points: 40, count: 36, race: 24, tip: 20 },
    names: { A: { from: 20, to: 488 }, B: { from: 872, to: 1340 } },
    targetSlot: 54,
    points: { A: { x: 516, width: 64 }, B: { x: 780, width: 64 } },
    centre: { x: 580, width: 200, inset: 0 },
    tips: {
      baseline: 133,
      A: { from: 20, to: 568 },
      B: { from: 872, to: 1340 },
      tab: { y: 110, height: 32, A: { x: 8, width: 572 }, B: { x: 780, width: 572 } },
    },
  },
  wide: {
    width: 1920,
    bar: { y: 54, radius: 0, tipsHeight: 96 },
    primaryHeight: 62,
    fonts: { name: 34, target: 26, points: 44, count: 38, race: 26, tip: 24 },
    names: { A: { from: 48, to: 714 }, B: { from: 1206, to: 1872 } },
    targetSlot: 64,
    points: { A: { x: 750, width: 92 }, B: { x: 1078, width: 92 } },
    centre: { x: 850, width: 220, inset: 6 },
    tips: { baseline: 140, A: { from: 48, to: 840 }, B: { from: 1206, to: 1872 }, tab: null },
  },
} as const

function MatchArtwork(props: { values: MatchValues; geometry: Geometry; colors: Colors; idPrefix: string }) {
  const { values, geometry: g, colors: c } = props
  const mid = g.bar.y + g.primaryHeight / 2
  const loser = values.winnerSeat === null ? null : opponentOf(values.winnerSeat)
  const fade = (seat: Seat) => (seat === loser ? 0.5 : 1)
  const slot = values.targets ? g.targetSlot : 0
  const hasTips = values.tips.A !== null || values.tips.B !== null

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
            <ClipRect region={nameRegion[seat]} y={g.bar.y} height={g.primaryHeight} />
          </clipPath>,
          <clipPath key={`tip-${seat}`} id={clipId('tip', seat)}>
            <ClipRect region={g.tips[seat]} y={g.bar.y + g.primaryHeight} height={SECONDARY_CLIP_HEIGHT} />
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

      {SEATS.map((seat) =>
        values.tips[seat] !== null && g.tips.tab ? (
          <path
            key={seat}
            d={tabPath(g.tips.tab[seat].x, g.tips.tab.y, g.tips.tab[seat].width, g.tips.tab.height, 10)}
            fill={c.tab}
            fillOpacity={c.bandOpacity}
          />
        ) : null,
      )}

      <rect
        x={0}
        y={g.bar.y}
        width={g.width}
        height={hasTips && !g.tips.tab ? g.bar.tipsHeight : g.primaryHeight}
        rx={g.bar.radius}
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
                y={g.bar.y + g.centre.inset}
                width={g.points[seat].width}
                height={g.primaryHeight - 2 * g.centre.inset}
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
              x={g.tips[seat].from}
              y={g.tips.baseline}
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
        y={g.bar.y + g.centre.inset}
        width={g.centre.width}
        height={g.primaryHeight - 2 * g.centre.inset}
        rx={g.centre.inset}
        fill={c.amber}
      />
      {SEATS.map((seat) => (
        <text
          key={seat}
          x={g.centre.x + g.centre.width * (seat === 'A' ? 0.2 : 0.8)}
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

/** Tall enough for the secondary row in every layout; the box itself bounds the rest. */
const SECONDARY_CLIP_HEIGHT = 60

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

/** Mirrors the table: the object ball is ringed in amber and potted balls are dimmed. */
function BallRow(props: {
  balls: NonNullable<MatchValues['balls']>
  centreX: number
  colors: Colors
  idPrefix: string
}) {
  const width = props.balls.length * BALL.pitch + 8
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
          cx={left + 4 + BALL.pitch / 2 + index * BALL.pitch}
          cy={cy}
          status={status}
          colors={props.colors}
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
  colors: Colors
  idPrefix: string
}) {
  return (
    <g opacity={props.status === 'potted' ? 0.22 : 1}>
      {props.status === 'object' ? (
        <circle
          cx={props.cx}
          cy={props.cy}
          r={BALL.radius + 3.5}
          fill="none"
          stroke={props.colors.amber}
          strokeWidth={3}
        />
      ) : null}
      <circle
        cx={props.cx}
        cy={props.cy}
        r={BALL.radius}
        fill={`url(#${props.idPrefix}-ball-${props.ball})`}
      />
      <circle cx={props.cx} cy={props.cy} r={BALL.radius} fill={`url(#${props.idPrefix}-shine)`} />
    </g>
  )
}

/** Approximates the cap-height centre for the system UI fonts, which `dominant-baseline` renders unevenly. */
function baseline(mid: number, fontSize: number) {
  return Math.round(mid + fontSize * 0.36)
}

/** A tab hanging under the bar: square top corners against the bar, rounded bottom corners. */
function tabPath(x: number, y: number, width: number, height: number, radius: number) {
  return [
    `M${x} ${y}`,
    `H${x + width}`,
    `V${y + height - radius}`,
    `Q${x + width} ${y + height} ${x + width - radius} ${y + height}`,
    `H${x + radius}`,
    `Q${x} ${y + height} ${x} ${y + height - radius}`,
    'Z',
  ].join(' ')
}
