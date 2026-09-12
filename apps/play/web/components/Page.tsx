import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from './ui/utils'

type PageProps = {
  title: string
  backLink?: { to: string; label: string }
  children: ReactNode
  className?: string
}

export function Page({ title, backLink, children, className }: PageProps) {
  return (
    <main className={cn('flex flex-1 flex-col gap-6 bg-background px-4 py-6 text-foreground', className)}>
      <header>
        {backLink ? (
          <Link
            to={backLink.to}
            className="mb-1 inline-flex min-h-11 items-center gap-1 text-[17px] text-text-lo outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronLeftIcon />
            {backLink.label}
          </Link>
        ) : null}
        <h1 className="text-[32px] leading-tight font-bold tracking-[-0.025em]">{title}</h1>
      </header>
      {children}
    </main>
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="size-5 shrink-0 -translate-y-px" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m12 5-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
