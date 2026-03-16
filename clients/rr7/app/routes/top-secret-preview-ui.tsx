import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  Textarea,
} from '@ks/ui'
import { useState } from 'react'
import { useSearchParams } from 'react-router'

const previewFlavors = {
  mocha: { label: 'Catppuccin Mocha', dark: true },
  latte: { label: 'Catppuccin Latte', dark: false },
} as const

type FlavorId = keyof typeof previewFlavors

function isFlavorId(value: string): value is FlavorId {
  return value in previewFlavors
}

export default function TopSecretPreviewUiRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const flavorId = searchParams.get('flavor') === 'latte' ? 'latte' : 'mocha'
  const [compact, setCompact] = useState(false)
  const flavor = previewFlavors[flavorId]
  const flavorClass = flavorId === 'latte' ? 'latte' : 'dark'

  function setFlavor(flavor: FlavorId) {
    const next = new URLSearchParams(searchParams)
    if (flavor === 'mocha') {
      next.delete('flavor')
    } else {
      next.set('flavor', flavor)
    }
    setSearchParams(next, { replace: true })
  }

  return (
    <div className={`min-h-dvh bg-background px-4 py-6 text-foreground ${flavorClass}`}>
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>UI Preview Lab</CardTitle>
            <CardDescription>Internal preview route for Catppuccin-backed package components.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="flavor">Flavor</Label>
              <select
                id="flavor"
                value={flavorId}
                onChange={(event) => {
                  if (isFlavorId(event.target.value)) {
                    setFlavor(event.target.value)
                  }
                }}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {Object.entries(previewFlavors).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Density</Label>
              <div className="flex flex-wrap gap-2">
                <Button variant={compact ? 'outline' : 'default'} size="sm" onClick={() => setCompact(false)}>
                  Comfortable
                </Button>
                <Button variant={compact ? 'default' : 'outline'} size="sm" onClick={() => setCompact(true)}>
                  Compact
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Current mode</Label>
              <div className="flex flex-wrap gap-2">
                <Badge>{flavor.label}</Badge>
                <Badge variant="secondary">{flavor.dark ? 'Dark' : 'Light'}</Badge>
                <Badge variant="outline">Default: Mocha</Badge>
                <Badge variant="destructive">Token test</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Use <code>?flavor=latte</code> in URL to force light flavor.
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card size={compact ? 'sm' : 'default'}>
            <CardHeader>
              <CardTitle>Buttons</CardTitle>
              <CardDescription>Variants and sizes pulled from @ks/ui.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link style</Button>
              </div>
              <Separator />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs">XS</Button>
                <Button size="sm">SM</Button>
                <Button size="default">Default</Button>
                <Button size="lg">LG</Button>
                <Button size="icon" aria-label="Icon">
                  +
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card size={compact ? 'sm' : 'default'}>
            <CardHeader>
              <CardTitle>Form Controls</CardTitle>
              <CardDescription>Inputs and textarea in a neutral match setup context.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="match-name">Match name</Label>
                <Input id="match-name" defaultValue="Friday Ladder Final" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="operator-note">Operator note</Label>
                <Textarea
                  id="operator-note"
                  defaultValue="Table 2 stream is delayed by 8 seconds."
                  className={compact ? 'min-h-12' : 'min-h-20'}
                />
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button variant="ghost">Reset</Button>
              <Button>Save</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
