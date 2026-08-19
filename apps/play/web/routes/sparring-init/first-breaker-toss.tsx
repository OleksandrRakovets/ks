import { opponentOf, type Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { Button } from '@ks/ui'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

function playerInitial(name: string): string {
  return name.trim().slice(0, 1).toLocaleUpperCase()
}

export function FirstBreakerField(props: {
  playerNames: { A: string; B: string }
  firstBreakerSeat: Seat | null
  onFirstBreakerSeatChange: (seat: Seat | null) => void
}) {
  const { t } = useTranslation()
  const [tossWinner, setTossWinner] = useState<Seat | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [displaySeat, setDisplaySeat] = useState<Seat | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimers() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    intervalRef.current = null
    timeoutRef.current = null
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  useEffect(() => {
    clearTimers()
    setTossWinner(null)
    setIsRolling(false)
    setDisplaySeat(null)
  }, [props.playerNames.A, props.playerNames.B])

  function rollCoin() {
    clearTimers()
    setIsRolling(true)
    setTossWinner(null)
    setDisplaySeat(null)
    props.onFirstBreakerSeatChange(null)

    intervalRef.current = setInterval(() => {
      setDisplaySeat(Math.random() < 0.5 ? 'A' : 'B')
    }, 120)

    timeoutRef.current = setTimeout(() => {
      const winner = Math.random() < 0.5 ? 'A' : 'B'
      clearTimers()
      setDisplaySeat(winner)
      setTossWinner(winner)
      setIsRolling(false)
    }, 2400)
  }

  function chooseBreaker(seat: Seat) {
    if (!tossWinner) return
    props.onFirstBreakerSeatChange(seat)
  }

  const winnerName = tossWinner ? props.playerNames[tossWinner] : null
  const opponentName = tossWinner ? props.playerNames[opponentOf(tossWinner)] : null
  const breakerName = props.firstBreakerSeat ? props.playerNames[props.firstBreakerSeat] : null
  const displayInitial = displaySeat ? playerInitial(props.playerNames[displaySeat]) : ''
  const coinLabel = isRolling
    ? t(keys.match.sparring.firstBreaker.coinRolling)
    : displaySeat
      ? t(keys.match.sparring.firstBreaker.coinShows, { name: props.playerNames[displaySeat] })
      : t(keys.match.sparring.firstBreaker.coinReady)

  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">{t(keys.match.sparring.firstBreaker.title)}</legend>
      {props.firstBreakerSeat ? <input type="hidden" name="firstBreakerSeat" value={props.firstBreakerSeat} /> : null}

      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div
          className={`grid size-24 place-items-center rounded-full border-4 border-primary/60 bg-primary/10 text-3xl font-bold shadow-inner ${
            isRolling ? 'animate-[spin_0.55s_linear_infinite]' : ''
          }`}
          aria-live="polite"
          aria-label={coinLabel}
        >
          {displayInitial}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <p className="text-sm font-medium">
              {isRolling
                ? t(keys.match.sparring.firstBreaker.coinInAir)
                : winnerName
                  ? t(keys.match.sparring.firstBreaker.tossWinner, { name: winnerName })
                  : t(keys.match.sparring.firstBreaker.tossInstructions)}
            </p>
            <p className="text-sm text-muted-foreground">
              {breakerName
                ? t(keys.match.sparring.firstBreaker.breakerSelected, { name: breakerName })
                : winnerName
                  ? t(keys.match.sparring.firstBreaker.chooseBreaker, { name: winnerName })
                  : t(keys.match.sparring.firstBreaker.winnerChooses)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!tossWinner ? (
              <Button type="button" variant="outline" onClick={rollCoin} disabled={isRolling}>
                {t(keys.match.sparring.firstBreaker.tossCoin)}
              </Button>
            ) : null}
            {tossWinner ? (
              <>
                <Button type="button" onClick={() => chooseBreaker(tossWinner)} disabled={isRolling}>
                  {t(keys.match.sparring.firstBreaker.playerBreaks, { name: winnerName })}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => chooseBreaker(opponentOf(tossWinner))}
                  disabled={isRolling}
                >
                  {t(keys.match.sparring.firstBreaker.playerBreaks, { name: opponentName })}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </fieldset>
  )
}
