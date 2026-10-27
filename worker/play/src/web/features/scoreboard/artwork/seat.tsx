import { opponentOf, type Seat } from '@ks/core'

import { baseline, type Geometry, ROWS_HEIGHT } from '@/features/scoreboard/artwork/geometry'
import type { ThemePalette } from '@/features/scoreboard/themes/themes'
import type { ScoreboardMatchValues } from '@/features/scoreboard/values'

/**
 * One player's side of the bar: name plate, points box with its target, and tip. Names and tips
 * align to the inner edge, mirrored like a broadcast scoreboard. The side is clipped to the bar,
 * so the points box takes its rounded outer corners.
 */
export function SeatSide(props: {
  seat: Seat
  values: ScoreboardMatchValues
  geometry: Geometry
  palette: ThemePalette
  barClipId: string
  idPrefix: string
}) {
  const { seat, values, geometry: g, palette: p } = props
  const plate = g.namePlates[seat]
  const box = g.pointsBoxes[seat]
  const innerEdge = seat === 'A' ? plate.to : plate.from
  const anchor = seat === 'A' ? 'end' : 'start'
  const tip = values.tips[seat]
  const nameClipId = `${props.idPrefix}-name-${seat}`
  const tipClipId = `${props.idPrefix}-tip-${seat}`

  return (
    <g data-seat={seat} opacity={seatOpacity(values, seat)} clipPath={`url(#${props.barClipId})`}>
      <g data-part="name-plate">
        <clipPath id={nameClipId}>
          <rect x={plate.from} y={g.top} width={plate.to - plate.from} height={g.primaryHeight} />
        </clipPath>
        <text
          x={innerEdge}
          y={baseline(g.top + g.primaryHeight / 2, g.fonts.name)}
          textAnchor={anchor}
          clipPath={`url(#${nameClipId})`}
          fill={p.text}
          fontSize={g.fonts.name}
          fontWeight={600}
        >
          {values.names[seat]}
        </text>
      </g>
      <g data-part="points-box">
        <rect
          x={box.x}
          y={g.top}
          width={box.width}
          height={values.targets ? ROWS_HEIGHT : g.primaryHeight}
          fill={p.raised}
        />
        <text
          x={box.x + box.width / 2}
          y={baseline(g.top + g.primaryHeight / 2, g.fonts.points)}
          textAnchor="middle"
          fill={p.text}
          fontSize={g.fonts.points}
          fontWeight={700}
        >
          {values.points[seat]}
        </text>
        {values.targets ? (
          <text
            data-part="target"
            x={box.x + box.width / 2}
            y={baseline(secondaryRowMid(g), g.fonts.target)}
            textAnchor="middle"
            fill={p.dim}
            fontSize={g.fonts.target}
            fontWeight={600}
          >
            {values.targets[seat]}
          </text>
        ) : null}
      </g>
      {tip === null ? null : (
        <g data-part="tip">
          <clipPath id={tipClipId}>
            <rect
              x={plate.from}
              y={g.row}
              width={plate.to - plate.from}
              height={ROWS_HEIGHT - g.primaryHeight}
            />
          </clipPath>
          <text
            x={innerEdge}
            y={g.top + g.tipBaseline}
            textAnchor={anchor}
            clipPath={`url(#${tipClipId})`}
            fill={p.accent}
            fontSize={g.fonts.tip}
            fontWeight={600}
          >
            {tip.text}
          </text>
        </g>
      )}
    </g>
  )
}

/** A finished match dims the loser's name, points, and frames won. */
export function seatOpacity(values: ScoreboardMatchValues, seat: Seat) {
  return values.winnerSeat !== null && seat === opponentOf(values.winnerSeat) ? 0.5 : 1
}

export function secondaryRowMid(g: Geometry) {
  return (g.row + g.top + ROWS_HEIGHT) / 2
}
