import { opponentOf, type Seat } from '@ks/core'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui'
import { cn } from '@/components/ui/utils'

export function SeatChoiceToss(props: {
  headingId: string
  playerNames: { readonly A: string; readonly B: string }
  selectedSeat: Seat | null
  disabled?: boolean
  title: string
  coinInAir: string
  chooseSeat: (winnerName: string) => string
  tossCoin: string
  seatChoiceLabel: (playerName: string) => string
  onSelectedSeatChange: (seat: Seat | null) => void
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

  function rollCoin() {
    clearTimers()
    setIsRolling(true)
    setTossWinner(null)
    setDisplaySeat(null)
    props.onSelectedSeatChange(null)

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

  function chooseSeat(seat: Seat) {
    if (!tossWinner) return
    props.onSelectedSeatChange(seat)
  }

  const winnerName = tossWinner ? props.playerNames[tossWinner] : null
  const displayInitial = displaySeat ? playerInitial(props.playerNames[displaySeat]) : '?'

  return (
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
          id={props.headingId}
          className="text-[17px] leading-snug font-semibold"
          aria-live="polite"
          aria-atomic
        >
          {isRolling
            ? props.coinInAir
            : winnerName !== null && winnerName.length > 0
              ? props.chooseSeat(winnerName)
              : props.title}
        </h2>

        {!tossWinner ? (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="w-fit"
            onClick={rollCoin}
            disabled={(props.disabled ?? false) || isRolling}
          >
            {props.tossCoin}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:w-fit md:grid-cols-[9rem_9rem]">
            <SeatChoiceButton
              seat={tossWinner}
              playerName={props.playerNames[tossWinner]}
              selectedSeat={props.selectedSeat}
              disabled={(props.disabled ?? false) || isRolling}
              label={props.seatChoiceLabel(props.playerNames[tossWinner])}
              onChoose={chooseSeat}
            />
            <SeatChoiceButton
              seat={opponentOf(tossWinner)}
              playerName={props.playerNames[opponentOf(tossWinner)]}
              selectedSeat={props.selectedSeat}
              disabled={(props.disabled ?? false) || isRolling}
              label={props.seatChoiceLabel(props.playerNames[opponentOf(tossWinner)])}
              onChoose={chooseSeat}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SeatChoiceButton(props: {
  seat: Seat
  playerName: string
  selectedSeat: Seat | null
  disabled: boolean
  label: string
  onChoose: (seat: Seat) => void
}) {
  return (
    <Button
      type="button"
      size="touch"
      className="min-w-0 px-2"
      variant={props.selectedSeat === props.seat ? 'primary' : 'outline'}
      aria-pressed={props.selectedSeat === props.seat}
      aria-label={props.label}
      onClick={() => props.onChoose(props.seat)}
      disabled={props.disabled}
    >
      <span className="min-w-0 truncate">{firstName(props.playerName)}</span>
    </Button>
  )
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/u)[0] ?? displayName
}

function playerInitial(name: string): string {
  return name.trim().slice(0, 1).toLocaleUpperCase()
}
