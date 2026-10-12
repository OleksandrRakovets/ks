import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, useRouteError } from 'react-router'

import { cn } from './ui/utils'

/** Whether the nearest route error is a genuine 404 rather than a possibly transient failure. */
export function useRouteErrorIsNotFound(): boolean {
  const error = useRouteError()

  return isRouteErrorResponse(error) && error.status === 404
}

/** Not-found or generic failure surface shared by route error boundaries. */
export function RouteError({ className }: { className?: string }) {
  const { t } = useTranslation()
  const notFound = useRouteErrorIsNotFound()

  return (
    <main
      className={cn('flex flex-1 items-center justify-center bg-background px-6 text-foreground', className)}
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
        {notFound ? (
          <>
            <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
              {t(keys.app.notFound.eyebrow)}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(keys.app.notFound.title)}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{t(keys.app.notFound.description)}</p>
          </>
        ) : (
          <>
            <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
              {t(keys.app.error.eyebrow)}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t(keys.app.error.title)}</h1>
          </>
        )}
      </div>
    </main>
  )
}
