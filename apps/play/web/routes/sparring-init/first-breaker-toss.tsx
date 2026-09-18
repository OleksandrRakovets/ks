import { opponentOf, type Seat } from '@ks/core'
import { keys } from '@ks/i18n'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui'
import { cn } from '@/components/ui/utils'

import { firstName } from './player-name'

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
    }, 1800)
  }

  function chooseBreaker(seat: Seat) {
    if (!tossWinner) return
    props.onFirstBreakerSeatChange(seat)
  }

  const winnerName = tossWinner ? props.playerNames[tossWinner] : null
  const displayInitial = displaySeat ? playerInitial(props.playerNames[displaySeat]) : '?'

  return (
    <section className="rounded-lg border border-border p-3" aria-labelledby="first-breaker-heading">
      {props.firstBreakerSeat ? (
        <input type="hidden" name="firstBreakerSeat" value={props.firstBreakerSeat} />
      ) : null}

      <div className="grid grid-cols-[82px_1fr] items-center gap-3.5">
        <div
          className={cn(
            'grid size-[82px] place-items-center rounded-full border-[3px] text-[32px] font-bold shadow-inner',
            displaySeat ? 'border-amber bg-amber-dim text-amber' : 'border-border text-muted-foreground',
            isRolling && 'motion-safe:animate-[spin_0.55s_linear_infinite]',
          )}
          aria-hidden="true"
        >
          {displayInitial}
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">
          <h2
            id="first-breaker-heading"
            className="text-[17px] leading-snug font-semibold"
            aria-live="polite"
            aria-atomic="true"
          >
            {isRolling
              ? t(keys.match.sparring.firstBreaker.coinInAir)
              : winnerName !== null && winnerName.length > 0
                ? t(keys.match.sparring.firstBreaker.chooseBreaker, { name: winnerName })
                : t(keys.match.sparring.firstBreaker.title)}
          </h2>

          {!tossWinner ? (
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-fit"
              onClick={rollCoin}
              disabled={isRolling}
            >
              {t(keys.match.sparring.firstBreaker.tossCoin)}
            </Button>
          ) : null}
          {tossWinner ? (
            <div className="grid grid-cols-2 gap-2 md:w-fit md:grid-cols-[9rem_9rem]">
              <Button
                type="button"
                size="touch"
                className="min-w-0 px-2"
                variant={props.firstBreakerSeat === tossWinner ? 'primary' : 'outline'}
                aria-pressed={props.firstBreakerSeat === tossWinner}
                aria-label={t(keys.match.sparring.firstBreaker.playerBreaks, {
                  name: props.playerNames[tossWinner],
                })}
                onClick={() => chooseBreaker(tossWinner)}
                disabled={isRolling}
              >
                <span className="min-w-0 truncate">{firstName(props.playerNames[tossWinner])}</span>
              </Button>
              <Button
                type="button"
                size="touch"
                className="min-w-0 px-2"
                variant={props.firstBreakerSeat === opponentOf(tossWinner) ? 'primary' : 'outline'}
                aria-pressed={props.firstBreakerSeat === opponentOf(tossWinner)}
                aria-label={t(keys.match.sparring.firstBreaker.playerBreaks, {
                  name: props.playerNames[opponentOf(tossWinner)],
                })}
                onClick={() => chooseBreaker(opponentOf(tossWinner))}
                disabled={isRolling}
              >
                <span className="min-w-0 truncate">
                  {firstName(props.playerNames[opponentOf(tossWinner)])}
                </span>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function playerInitial(name: string): string {
  return name.trim().slice(0, 1).toLocaleUpperCase()
}
