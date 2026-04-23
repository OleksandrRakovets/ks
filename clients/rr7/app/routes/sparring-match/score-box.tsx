import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'

type Props = {
  nameA: string
  nameB: string
  framesWon: { A: number; B: number }
  frameIndex: number
  targetFrames: number
}

export function ScoreBox({ nameA, nameB, framesWon, frameIndex, targetFrames }: Props) {
  const { t } = useTranslation()

  return (
    <div className="sticky top-11 z-10 border-b border-border bg-background px-4 pt-4 pb-3">
      <div className="mb-2 text-center text-xs text-muted-foreground tabular-nums">
        {framesWon.A} : {framesWon.B}&ensp;·&ensp;
        {t(keys.match.scoreboard.frame)} {frameIndex}&ensp;·&ensp; до {targetFrames} перемог
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="line-clamp-2 text-sm font-medium">{nameA}</span>
        <div className="flex items-center">
          <span className="text-7xl font-bold tracking-tight text-amber tabular-nums">{framesWon.A}</span>
          <span className="mx-2 text-4xl font-extralight tracking-tight text-amber">:</span>
          <span className="text-7xl font-bold tracking-tight text-amber tabular-nums">{framesWon.B}</span>
        </div>
        <span className="line-clamp-2 text-right text-sm font-medium">{nameB}</span>
      </div>
    </div>
  )
}
