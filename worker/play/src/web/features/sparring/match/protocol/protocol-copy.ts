import type { ProtocolMessage } from '@ks/application'
import type { TFunction } from 'i18next'

export function protocolRowLabel(t: TFunction, row: { message: ProtocolMessage }): string {
  return t(row.message.key, { ...row.message.params, balls: protocolBallsLabel(t, row.message.pottedBalls) })
}

function protocolBallsLabel(t: TFunction, balls: readonly number[] | undefined): string {
  return balls ? balls.map((ball) => protocolBallLabel(t, ball)).join(', ') : t('match.protocol.balls.none')
}

function protocolBallLabel(t: TFunction, ball: number): string {
  switch (ball) {
    case 0:
      return t('match.protocol.balls.0')
    case 1:
      return t('match.protocol.balls.1')
    case 2:
      return t('match.protocol.balls.2')
    case 3:
      return t('match.protocol.balls.3')
    case 4:
      return t('match.protocol.balls.4')
    case 5:
      return t('match.protocol.balls.5')
    case 6:
      return t('match.protocol.balls.6')
    case 7:
      return t('match.protocol.balls.7')
    default:
      return t('match.protocol.balls.none')
  }
}
