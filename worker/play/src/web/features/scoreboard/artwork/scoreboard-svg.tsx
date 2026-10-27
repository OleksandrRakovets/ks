import type { SupportedLocale } from '@ks/i18n'

import { BallRow } from '@/features/scoreboard/artwork/ball-row'
import { Centre } from '@/features/scoreboard/artwork/centre'
import {
  artworkGeometry,
  barOutline,
  baseline,
  FONT_FAMILY,
  type Geometry,
  type ScoreboardLayout,
} from '@/features/scoreboard/artwork/geometry'
import { SeatSide, secondaryRowMid } from '@/features/scoreboard/artwork/seat'
import {
  SCOREBOARD_THEMES,
  type ScoreboardTheme,
  type ThemePalette,
} from '@/features/scoreboard/themes/themes'
import type { ScoreboardMatchValues, ScoreboardValues } from '@/features/scoreboard/values'

/**
 * The scoreboard artwork: one self-contained SVG using inline presentation attributes only, with
 * no stylesheet classes, foreignObject, external images, or web fonts, so it rasterizes the same
 * outside the page. It is a pure function of its props (no hooks), so a server can render it too.
 * It never branches on the game: each part draws from the shape of the values. `data-part`
 * attributes name the parts in the feature's vocabulary.
 */
export function ScoreboardSvg(props: {
  values: ScoreboardValues
  layout: ScoreboardLayout
  theme: ScoreboardTheme
  locale: SupportedLocale
}) {
  const { values } = props
  const g = artworkGeometry(props.layout, values.size, values.kind === 'match' ? values.centre : null)
  const palette = SCOREBOARD_THEMES[props.theme]

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={g.width}
      height={g.height}
      viewBox={`0 0 ${g.width} ${g.height}`}
      lang={props.locale}
      data-match-id={values.matchId}
      data-seq={values.kind === 'match' ? values.seq : undefined}
      fontFamily={FONT_FAMILY}
    >
      {values.kind === 'match' ? (
        <MatchArtwork values={values} geometry={g} palette={palette} idPrefix={`scoreboard-${props.layout}`} />
      ) : null}
    </svg>
  )
}

/** Draw order: ball row, bar, both seat sides (clipped to the bar), centre, handicap label. */
function MatchArtwork(props: {
  values: ScoreboardMatchValues
  geometry: Geometry
  palette: ThemePalette
  idPrefix: string
}) {
  const { values, geometry: g, palette } = props
  const barClipId = `${props.idPrefix}-bar`

  const outline = barOutline(
    g,
    { A: values.tips.A !== null, B: values.tips.B !== null },
    values.targets !== null,
  )

  return (
    <>
      {values.balls ? (
        <BallRow balls={values.balls} centreX={g.width / 2} palette={palette} idPrefix={props.idPrefix} />
      ) : null}

      <clipPath id={barClipId}>
        <path d={outline} />
      </clipPath>
      <path data-part="bar" d={outline} fill={palette.bar} fillOpacity={palette.barOpacity} />

      {(['A', 'B'] as const).map((seat) => (
        <SeatSide
          key={seat}
          seat={seat}
          values={values}
          geometry={g}
          palette={palette}
          barClipId={barClipId}
          idPrefix={props.idPrefix}
        />
      ))}

      <Centre centre={values.centre} values={values} geometry={g} palette={palette} />

      {values.targets === null || values.targets.label === null ? null : (
        <text
          data-part="handicap-label"
          x={g.centre.x + g.centre.width / 2}
          y={baseline(secondaryRowMid(g), g.fonts.tip)}
          textAnchor="middle"
          fill={palette.dim}
          fontSize={g.fonts.tip}
          fontWeight={600}
        >
          {values.targets.label}
        </text>
      )}
    </>
  )
}
