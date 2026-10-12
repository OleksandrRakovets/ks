import type { BySeatNumber } from '@ks/core'

import { cn } from '@/components/ui/utils'
import type { ResultPresentation } from '@/features/sparring/match/result-presentation'

export function ResultPanel({ presentation }: { presentation: ResultPresentation }) {
  return (
    <section className="px-4 pb-8">
      <ResultScoreList title={presentation.title} rows={presentation.rows} />
      <p className="px-4 py-[18px] text-center text-base text-muted-foreground">
        <time dateTime={presentation.endedAtIso}>{presentation.finishedLabel}</time>
      </p>
    </section>
  )
}

function ResultScoreList({
  title,
  rows,
}: {
  title: string
  rows: readonly { index: number; score: BySeatNumber }[]
}) {
  return (
    <div className="mt-3 pt-5">
      <h2 className="text-base font-semibold text-muted-foreground">{title}</h2>
      <ol className="mt-2 grid grid-cols-[1fr_auto_auto_auto_1fr] gap-x-2">
        {rows.map(({ index, score }) => (
          <li
            key={index}
            className="col-span-5 grid min-h-12 grid-cols-subgrid items-center border-b border-divider text-xl tabular-nums first:border-t"
          >
            <span className="text-base text-muted-foreground">{index}</span>
            <span
              className={cn(
                'text-right',
                score.A > score.B && 'font-bold',
                score.A < score.B && 'text-muted-foreground',
              )}
            >
              {score.A}
            </span>
            <span className="text-muted-foreground">:</span>
            <span
              className={cn(score.B > score.A && 'font-bold', score.B < score.A && 'text-muted-foreground')}
            >
              {score.B}
            </span>
            <span />
          </li>
        ))}
      </ol>
    </div>
  )
}
