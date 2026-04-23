import { useMatches, Link } from 'react-router'

import { BurgerMenu } from './BurgerMenu'

export type HeaderConfig = {
  title?: string
  backTo?: string
}

function BackArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-divider bg-base px-3">
      <div className="w-10">
        {config.backTo ? (
          <Link
            to={config.backTo}
            aria-label="Назад"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-green transition-colors hover:bg-black/10 active:bg-black/20"
          >
            <BackArrowIcon />
          </Link>
        ) : null}
      </div>

      <div className="flex-1 truncate text-center font-medium">{config.title ?? 'Play & Keep Score'}</div>

      <div className="w-10">
        <BurgerMenu />
      </div>
    </header>
  )
}
