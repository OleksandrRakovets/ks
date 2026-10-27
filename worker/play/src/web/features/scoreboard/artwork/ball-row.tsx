import { STRILA_BALL_PALETTE } from '@/components/strila-ball'
import { BALL } from '@/features/scoreboard/artwork/geometry'
import type { ThemePalette } from '@/features/scoreboard/themes/themes'
import type { ScoreboardBall } from '@/features/scoreboard/values'

/**
 * Strila's balls in table order on a ball tray above the bar. Mirrors the table: the ball(s) on
 * are larger and potted balls are dimmed. Ball colours are physical, not themed.
 */
export function BallRow(props: {
  balls: readonly ScoreboardBall[]
  centreX: number
  palette: ThemePalette
  idPrefix: string
}) {
  const width = props.balls.length * BALL.pitch
  const left = props.centreX - width / 2
  const cy = BALL.rowHeight / 2
  const shineId = `${props.idPrefix}-shine`
  const ballId = (ball: ScoreboardBall['ball']) => `${props.idPrefix}-ball-${ball}`

  return (
    <g data-part="ball-row">
      <defs>
        {props.balls.map(({ ball }) => (
          <radialGradient key={ball} id={ballId(ball)} cx="42%" cy="38%" r="62%">
            <stop offset="0%" stopColor={STRILA_BALL_PALETTE[ball].highlight} />
            <stop offset="54%" stopColor={STRILA_BALL_PALETTE[ball].base} />
            <stop offset="100%" stopColor={STRILA_BALL_PALETTE[ball].shade} />
          </radialGradient>
        ))}
        <radialGradient id={shineId} cx="34%" cy="27%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.78} />
          <stop offset="8%" stopColor="#FFFFFF" stopOpacity={0.78} />
          <stop offset="10%" stopColor="#FFFFFF" stopOpacity={0.22} />
          <stop offset="34%" stopColor="#FFFFFF" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect
        data-part="ball-tray"
        x={left}
        y={0}
        width={width}
        height={BALL.rowHeight}
        rx={BALL.rowHeight / 2}
        fill={props.palette.bar}
        fillOpacity={props.palette.barOpacity}
      />
      {props.balls.map(({ ball, status }, index) => {
        const cx = left + BALL.pitch / 2 + index * BALL.pitch
        const r = status === 'object' ? BALL.objectRadius : BALL.radius

        return (
          <g
            key={ball}
            data-part="ball"
            data-ball={ball}
            data-status={status}
            opacity={status === 'potted' ? 0.22 : 1}
          >
            <circle cx={cx} cy={cy} r={r} fill={`url(#${ballId(ball)})`} />
            <circle cx={cx} cy={cy} r={r} fill={`url(#${shineId})`} />
          </g>
        )
      })}
    </g>
  )
}
