import type { Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

import { SeatChoiceToss } from '@/features/seat-choice-toss'

type FirstBreakerFieldProps = {
  playerNames: { A: string; B: string }
  firstBreakerSeat: Seat | null
  onFirstBreakerSeatChange: (seat: Seat | null) => void
}

export function FirstBreakerField(props: FirstBreakerFieldProps) {
  return <FirstBreakerToss key={`${props.playerNames.A}\0${props.playerNames.B}`} {...props} />
}

function FirstBreakerToss(props: FirstBreakerFieldProps) {
  const { t } = useTranslation()

  return (
    <section className="rounded-lg border border-border p-3" aria-labelledby="first-breaker-heading">
      {props.firstBreakerSeat ? (
        <input type="hidden" name="firstBreakerSeat" value={props.firstBreakerSeat} />
      ) : null}
      <SeatChoiceToss
        headingId="first-breaker-heading"
        playerNames={props.playerNames}
        selectedSeat={props.firstBreakerSeat}
        title={t(keys.match.sparring.firstBreaker.title)}
        coinInAir={t(keys.match.sparring.firstBreaker.coinInAir)}
        chooseSeat={(winnerName) => t(keys.match.sparring.firstBreaker.chooseBreaker, { name: winnerName })}
        tossCoin={t(keys.match.sparring.firstBreaker.tossCoin)}
        seatChoiceLabel={(playerName) =>
          t(keys.match.sparring.firstBreaker.playerBreaks, { name: playerName })
        }
        onSelectedSeatChange={props.onFirstBreakerSeatChange}
      />
    </section>
  )
}
