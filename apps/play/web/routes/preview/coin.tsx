import { type Seat } from '@ks/core'
import { useState } from 'react'

import { SeatChoiceToss } from '@/components/seat-choice-toss'
import { Button } from '@/components/ui'

export default function PreviewCoinRoute() {
  const [attempt, setAttempt] = useState(0)
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null)

  function retry() {
    setSelectedSeat(null)
    setAttempt((previous) => previous + 1)
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-lg flex-col">
        <h1 className="mb-18 text-xl font-semibold tracking-tight">Перевір самостійно:</h1>
        <section className="mb-12 rounded-lg border border-border p-3" aria-labelledby="preview-coin-heading">
          <SeatChoiceToss
            key={attempt}
            headingId="preview-coin-heading"
            playerNames={{ A: 'Орел', B: 'Решка' }}
            selectedSeat={selectedSeat}
            title="Підкиньте монету"
            coinInAir="Монета в повітрі…"
            chooseSeat={(winnerName) => `Випало: ${winnerName}`}
            tossCoin="Підкинути монету"
            seatChoiceLabel={(playerName) => `Обрати: ${playerName}`}
            onSelectedSeatChange={setSelectedSeat}
          />
        </section>
        <Button type="button" variant="outline" size="touch" className="w-fit" onClick={retry}>
          Спробувати ще раз
        </Button>
      </div>
    </main>
  )
}
