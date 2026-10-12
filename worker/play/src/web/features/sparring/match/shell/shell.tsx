import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from '@/components/ui/utils'

export type ShellNavigation = {
  exitTo: string
  exitLabel: string
  label: string
  primary: { to: string; label: string }
  protocol: { to: string; label: string }
}

/** Reading pages scroll the board, body, and footer together; fixed Control pages keep all three in the viewport. */
export function Shell(props: {
  active: 'primary' | 'protocol'
  layout: 'fixed' | 'reading'
  header: { title: string; rule: string }
  navigation: ShellNavigation
  headerControl?: ReactNode
  board: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-match flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-[52px] shrink-0 items-center gap-3 px-1.5">
        <Link
          to={props.navigation.exitTo}
          aria-label={props.navigation.exitLabel}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <CloseIcon />
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <strong className="truncate text-[17px] leading-none font-semibold">{props.header.title}</strong>
          {props.header.rule ? (
            <span className="shrink-0 text-base leading-none">{props.header.rule}</span>
          ) : null}
        </div>
        {props.headerControl ?? <span aria-hidden className="size-11 shrink-0" />}
      </header>

      <div
        className={cn(
          'min-h-0 flex-1',
          props.layout === 'fixed' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overscroll-contain',
        )}
      >
        {props.board}
        <div className={props.layout === 'fixed' ? 'flex min-h-0 flex-1 flex-col' : undefined}>
          {props.children}
        </div>
        {props.footer}
      </div>

      <nav
        className="grid h-14 shrink-0 grid-cols-2 gap-1 bg-background px-2 py-1.5"
        aria-label={props.navigation.label}
      >
        <Tab active={props.active === 'primary'} to={props.navigation.primary.to}>
          {props.navigation.primary.label}
        </Tab>
        <Tab active={props.active === 'protocol'} to={props.navigation.protocol.to}>
          {props.navigation.protocol.label}
        </Tab>
      </nav>
    </main>
  )
}

function Tab(props: { active: boolean; to: string; children: ReactNode }) {
  return (
    <Link
      to={props.to}
      aria-current={props.active ? 'page' : undefined}
      className={cn(
        'grid place-items-center rounded-lg text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        props.active ? 'bg-overlay text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {props.children}
    </Link>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden className="size-5" viewBox="0 0 20 20" fill="none">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
