import { Card, CardContent, CardHeader, CardTitle } from '@ks/ui'
import { Link } from 'react-router'

const previewPages = [
  {
    href: '/top-secret/preview/ui',
    title: 'UI Preview',
    description: 'Package component playground and theme checks.',
  },
  {
    href: '/top-secret/preview/game-state',
    title: 'Game State Machines',
    description: 'Generated phase and command views for each game implementation.',
  },
] as const

export default function PreviewIndexRoute() {
  return (
    <main className="min-h-dvh flex-1 bg-background px-4 py-6 text-foreground">
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Top-secret previews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal pages for reviewing generated facts and UI building blocks.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {previewPages.map((page) => (
            <Card key={page.href}>
              <CardHeader>
                <CardTitle className="text-lg">
                  <Link className="underline-offset-4 hover:underline" to={page.href}>
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
