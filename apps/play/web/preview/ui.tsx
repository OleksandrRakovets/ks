import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Separator,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui'

import { MatchNavigation } from './components/match-navigation'

const buttonVariants = ['primary', 'secondary', 'outline', 'ghost', 'destructive'] as const

function Specimen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold tracking-widest text-text-lo uppercase">{label}</p>
      {children}
    </div>
  )
}

export default function PreviewUiRoute() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <MatchNavigation />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="grid gap-6 border-b border-border pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex max-w-2xl flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="live">Base UI</Badge>
              <Badge>Preview v2</Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Club controls, rebuilt from the primitive up.
            </h1>
            <p className="text-sm leading-relaxed text-text-lo sm:text-base">
              A preview-local component set built on Base UI behavior and the existing club theme. No shared
              Radix component is used on this page.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <dt className="text-text-lo">Foundation</dt>
            <dd className="font-medium">Base UI 1.8</dd>
            <dt className="text-text-lo">Density</dt>
            <dd className="font-medium">Touch-first</dd>
            <dt className="text-text-lo">Theme</dt>
            <dd className="font-medium">Club Terminal</dd>
          </dl>
        </header>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="Component specimens">
          <Card>
            <CardHeader>
              <CardTitle>Buttons</CardTitle>
              <CardDescription>
                Five visual priorities with one consistent focus and disabled contract.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Specimen label="Variants">
                <div className="flex flex-wrap gap-2">
                  {buttonVariants.map((variant) => (
                    <Button key={variant} variant={variant}>
                      {variant[0].toUpperCase() + variant.slice(1)}
                    </Button>
                  ))}
                </div>
              </Specimen>
              <Separator />
              <Specimen label="Scale">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm">Compact</Button>
                  <Button size="md">Default</Button>
                  <Button size="touch">Touch target</Button>
                  <Button size="icon" aria-label="Add one point">
                    +1
                  </Button>
                </div>
              </Specimen>
              <Separator />
              <Specimen label="Disabled">
                <div className="flex flex-wrap gap-2">
                  <Button disabled>Unavailable</Button>
                  <Button variant="outline" disabled>
                    Unavailable
                  </Button>
                  <Button variant="destructive" disabled>
                    Unavailable
                  </Button>
                </div>
              </Specimen>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Match setup</CardTitle>
              <CardDescription>
                Fields compose labels, guidance, validation, and controls as one unit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="preview-match-name">Match name</FieldLabel>
                  <Input id="preview-match-name" defaultValue="Friday ladder final" />
                  <FieldDescription>Shown to players and public spectators.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="preview-note">Operator note</FieldLabel>
                  <Textarea id="preview-note" placeholder="Add a private note…" />
                </Field>
                <Field data-invalid>
                  <FieldLabel htmlFor="preview-invalid">Table number</FieldLabel>
                  <Input id="preview-invalid" defaultValue="Court A" aria-invalid />
                  <FieldDescription>Use a number from 1 to 24.</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button variant="ghost">Reset</Button>
              <Button>Save setup</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Choice controls</CardTitle>
              <CardDescription>Base UI owns keyboard navigation and selection state.</CardDescription>
            </CardHeader>
            <CardContent>
              <Specimen label="Race target">
                <ToggleGroup defaultValue={['5']} aria-label="Race target">
                  <ToggleGroupItem value="3">Race to 3</ToggleGroupItem>
                  <ToggleGroupItem value="5">Race to 5</ToggleGroupItem>
                  <ToggleGroupItem value="7">Race to 7</ToggleGroupItem>
                </ToggleGroup>
              </Specimen>
              <Separator />
              <Specimen label="Multiple selections">
                <ToggleGroup multiple defaultValue={['protocol']} aria-label="Public match information">
                  <ToggleGroupItem value="score">Score</ToggleGroupItem>
                  <ToggleGroupItem value="protocol">Protocol</ToggleGroupItem>
                  <ToggleGroupItem value="players">Players</ToggleGroupItem>
                </ToggleGroup>
              </Specimen>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status language</CardTitle>
              <CardDescription>Compact semantic markers for match and connection state.</CardDescription>
            </CardHeader>
            <CardContent>
              <Specimen label="Badges">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="live">Active match</Badge>
                  <Badge>Frame prepared</Badge>
                  <Badge variant="warning">Connection delayed</Badge>
                  <Badge variant="destructive">Command rejected</Badge>
                </div>
              </Specimen>
              <Separator />
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                <Badge variant="live">Live</Badge>
                <p className="text-text-lo">Score changes are reaching spectators.</p>
                <Badge variant="warning">Syncing</Badge>
                <p className="text-text-lo">The latest accepted command is being delivered.</p>
                <Badge variant="destructive">Offline</Badge>
                <p className="text-text-lo">Controls pause until the connection returns.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
