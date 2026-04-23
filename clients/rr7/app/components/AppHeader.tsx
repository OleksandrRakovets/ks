import { useMatches, Link } from 'react-router'

import { BurgerMenu } from './BurgerMenu'

export type HeaderConfig = {
  title?: string
  backTo?: string
}

function BackArrowIcon() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
      <path d="M6 1L1 6l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AppHeader() {
  const matches = useMatches()

  const config =
    [...matches].reverse().reduce<HeaderConfig | null>((found, match) => {
      if (found) return found
      const handle = match.handle as { headerConfig?: (data: unknown) => HeaderConfig } | undefined
      return handle?.headerConfig?.(match.data) ?? null
    }, null) ?? {}

  return (
    <header className="sticky top-0 z-40 flex h-11 shrink-0 items-center justify-between border-b border-divider bg-deep ">
      <div className="w-10">
        {config.backTo ? (
          <Link to={config.backTo} aria-label="Назад" className="flex h-11 items-center px-3 text-green">
            <BackArrowIcon />
          </Link>
        ) : null}
      </div>

      <div className="flex-1 truncate text-center text-sm font-semibold tracking-[0.01em]">
        {config.title ?? 'Play & Keep Score'}
      </div>

      <div className="flex w-10 justify-end">
        <BurgerMenu />
      </div>
    </header>
  )
}
