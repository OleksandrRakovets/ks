import type { Seat } from '@ks/core'
import { Button } from '@ks/ui'
import { useEffect, useRef, useState } from 'react'

function opponentOfSeat(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A'
}

function playerInitial(name: string): string {
  return name.trim().slice(0, 1).toLocaleUpperCase()
}

export function FirstBreakerField(props: {
  playerNames: { A: string; B: string }
  firstBreakerSeat: Seat | null
  onFirstBreakerSeatChange: (seat: Seat | null) => void
}) {
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
  const opponentName = tossWinner ? props.playerNames[opponentOfSeat(tossWinner)] : null
  const breakerName = props.firstBreakerSeat ? props.playerNames[props.firstBreakerSeat] : null
  const displayInitial = displaySeat ? playerInitial(props.playerNames[displaySeat]) : ''

  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">First break-off</legend>
      {props.firstBreakerSeat ? <input type="hidden" name="firstBreakerSeat" value={props.firstBreakerSeat} /> : null}

      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <div
          className={`grid size-24 place-items-center rounded-full border-4 border-primary/60 bg-primary/10 text-3xl font-bold shadow-inner ${
            isRolling ? 'animate-[spin_0.55s_linear_infinite]' : ''
          }`}
          aria-live="polite"
          aria-label={
            isRolling ? 'Coin is rolling' : displaySeat ? `Coin shows ${props.playerNames[displaySeat]}` : 'Coin is ready'
          }
        >
          {displayInitial}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1">
            <p className="text-sm font-medium">
              {isRolling
                ? 'Coin is in the air...'
                : winnerName
                  ? `${winnerName} wins the toss.`
                  : 'Toss a coin to decide who makes the break-off call.'}
            </p>
            <p className="text-sm text-muted-foreground">
              {breakerName
                ? `${breakerName} will break first.`
                : winnerName
                  ? `${winnerName}, choose who breaks first.`
                  : 'The winner chooses whether to break or let the opponent break.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!tossWinner ? (
              <Button type="button" variant="outline" onClick={rollCoin} disabled={isRolling}>
                Toss coin
              </Button>
            ) : null}
            {tossWinner ? (
              <>
                <Button type="button" onClick={() => chooseBreaker(tossWinner)} disabled={isRolling}>
                  {winnerName} breaks
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => chooseBreaker(opponentOfSeat(tossWinner))}
                  disabled={isRolling}
                >
                  {opponentName} breaks
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </fieldset>
  )
}
