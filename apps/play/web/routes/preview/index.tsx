import { Link } from 'react-router'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { localizedPath } from '@/locale'
import { useRootLocale } from '@/root'

const previewPages = [
  {
    href: '/top-secret/preview/ui/',
    title: 'UI Preview v2',
    description: 'Preview-local Base UI components and club theme checks.',
  },
] as const

export default function PreviewIndexRoute() {
  const locale = useRootLocale()

  return (
    <main className="min-h-dvh flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full space-y-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Top-secret previews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal pages for reviewing Protocol output and UI building blocks.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {previewPages.map((page) => (
            <Card key={page.href}>
              <CardHeader>
                <CardTitle className="text-lg">
                  <Link className="underline-offset-4 hover:underline" to={localizedPath(page.href, locale)}>
                    {page.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{page.description}</CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
