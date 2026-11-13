import { keys } from '@ks/i18n'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, Link, useRevalidator, useRouteError } from 'react-router'

import { Button } from '@/components/ui'
import { cn } from '@/components/ui/utils'
import { localizedPath } from '@/i18n'
import { useRootLocale } from '@/root'

/** Whether the nearest route error is a genuine 404 rather than a possibly transient failure. */
export function useRouteErrorIsNotFound(): boolean {
  const error = useRouteError()

  return isRouteErrorResponse(error) && error.status === 404
}

/**
 * Not-found or generic failure surface shared by route error boundaries. Retry re-reads loaders only;
 * it never replays a Command POST.
 */
export function RouteError({ className }: { className?: string }) {
  const { t } = useTranslation()
  const notFound = useRouteErrorIsNotFound()
  const locale = useRootLocale()
  const { revalidate, state } = useRevalidator()

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
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {notFound ? null : (
            <Button size="touch" disabled={state === 'loading'} onClick={() => void revalidate()}>
              {t(keys.app.error.retry)}
            </Button>
          )}
          <Button
            size="touch"
            variant={notFound ? 'primary' : 'outline'}
            nativeButton={false}
            render={<Link to={localizedPath('/', locale)} />}
          >
            {t(keys.app.home)}
          </Button>
        </div>
      </div>
    </main>
  )
}
