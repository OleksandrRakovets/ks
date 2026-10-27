import { baseline, CENTRE_GAP, type Geometry, ROWS_HEIGHT } from '@/features/scoreboard/artwork/geometry'
import { seatOpacity } from '@/features/scoreboard/artwork/seat'
import type { ThemePalette } from '@/features/scoreboard/themes/themes'
import type { ScoreboardCentre, ScoreboardMatchValues } from '@/features/scoreboard/values'

type CentreProps<Kind extends ScoreboardCentre['kind']> = {
  centre: Extract<ScoreboardCentre, { kind: Kind }>
  values: ScoreboardMatchValues
  geometry: Geometry
  palette: ThemePalette
}

/** The block between the points boxes; each kind draws its own. */
export function Centre(props: CentreProps<ScoreboardCentre['kind']>) {
  return (
    <g data-part="centre" data-kind={props.centre.kind}>
      {centreArtwork(props)}
    </g>
  )
}

function centreArtwork(props: CentreProps<ScoreboardCentre['kind']>) {
  const { centre } = props

  switch (centre.kind) {
    case 'frames':
      return <FramesCentre {...props} centre={centre} />
    case 'target':
      return <TargetCentre {...props} centre={centre} />
    case 'separator':
      return <SeparatorCentre {...props} centre={centre} />
  }

  throw new Error('Unhandled scoreboard centre', { cause: centre satisfies never })
}

/** Frames won around the race: `1 (3) 0`. */
function FramesCentre({ centre, values, geometry: g, palette: p }: CentreProps<'frames'>) {
  const mid = g.top + g.primaryHeight / 2

  return (
    <>
      <rect x={g.centre.x} y={g.top} width={g.centre.width} height={g.primaryHeight} fill={p.accent} />
      {(['A', 'B'] as const).map((seat) => (
        <text
          key={seat}
          data-part="frames-won"
          data-seat={seat}
          x={
            seat === 'A'
              ? g.centre.x + CENTRE_GAP + g.centre.countWidth / 2
              : g.centre.x + g.centre.width - CENTRE_GAP - g.centre.countWidth / 2
          }
          y={baseline(mid, g.fonts.count)}
          textAnchor="middle"
          fill={p.onAccent}
          fontSize={g.fonts.count}
          fontWeight={700}
          opacity={seatOpacity(values, seat)}
        >
          {centre[seat]}
        </text>
      ))}
      <text
        data-part="race"
        x={g.centre.x + g.centre.width / 2}
        y={baseline(mid, g.fonts.race)}
        textAnchor="middle"
        fill={p.onAccentDim}
        fontSize={g.fonts.race}
        fontWeight={600}
      >
        ({centre.race})
      </text>
    </>
  )
}

/** A match to points' bare target. */
function TargetCentre({ centre, geometry: g, palette: p }: CentreProps<'target'>) {
  return (
    <>
      <rect x={g.centre.x} y={g.top} width={g.centre.width} height={g.primaryHeight} fill={p.accent} />
      <text
        x={g.centre.x + g.centre.width / 2}
        y={baseline(g.top + g.primaryHeight / 2, g.fonts.count)}
        textAnchor="middle"
        fill={p.onAccent}
        fontSize={g.fonts.count}
        fontWeight={700}
      >
        {centre.target}
      </text>
    </>
  )
}

/** A colon between the points (`8 : 4`), running down over the target row when it shows. */
function SeparatorCentre({ values, geometry: g, palette: p }: CentreProps<'separator'>) {
  return (
    <>
      <rect
        x={g.centre.x}
        y={g.top}
        width={g.centre.width}
        height={values.targets ? ROWS_HEIGHT : g.primaryHeight}
        fill={p.raised}
      />
      {/* The colon sits low against the digits' cap height. */}
      <text
        x={g.centre.x + g.centre.width / 2}
        y={baseline(g.top + g.primaryHeight / 2, g.fonts.points) - 3}
        textAnchor="middle"
        fill={p.text}
        fontSize={g.fonts.points}
        fontWeight={700}
      >
        :
      </text>
    </>
  )
}
