import { useEffect } from 'react'
import { useLocation } from 'react-router'

import { navigationCookieValue } from './navigation'

export function useRememberNavigation() {
  const { pathname, search, hash } = useLocation()

  useEffect(() => {
    try {
      const cookie = navigationCookieValue(new URL(`${window.location.origin}${pathname}${search}${hash}`))

      if (cookie !== null) document.cookie = cookie
    } catch {
      // Resuming navigation is best-effort when browser storage is unavailable.
    }
  }, [pathname, search, hash])
}
