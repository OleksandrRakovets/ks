import { Badge, Button, Input, Label, Separator, Textarea } from '@/components/ui'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-divider py-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-text-hi">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-text-ghost">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function SubSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 text-xs font-semibold tracking-widest text-text-ghost uppercase">{label}</p>
      {children}
    </div>
  )
}

export const handle = {
  headerConfig: () => ({ title: 'UI Preview Lab', backTo: '/top-secret/preview/' }),
}

export default function PreviewUiRoute() {
  return (
    <div className="min-h-dvh bg-background pb-12 text-foreground">
      <div className="mx-auto w-full">
        <Section title="Buttons" description="All variants × sizes.">
          <SubSection label="Variants">
            <div className="flex flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
          </SubSection>
          <SubSection label="Sizes">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">SM</Button>
              <Button size="default">Default</Button>
              <Button size="touch">Touch</Button>
            </div>
          </SubSection>
          <SubSection label="Icon sizes">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="icon-sm" aria-label="icon-sm">
                +
              </Button>
              <Button size="icon" aria-label="icon">
                +
              </Button>
              <Button size="icon-lg" aria-label="icon-lg">
                +
              </Button>
            </div>
          </SubSection>
          <SubSection label="States">
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled>Default disabled</Button>
                <Button variant="secondary" disabled>
                  Secondary disabled
                </Button>
                <Button variant="outline" disabled>
                  Outline disabled
                </Button>
                <Button variant="ghost" disabled>
                  Ghost disabled
                </Button>
                <Button variant="destructive" disabled>
                  Destructive disabled
                </Button>
                <Button variant="link" disabled>
                  Link disabled
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="touch" disabled>
                  Touch disabled
                </Button>
                <Button variant="secondary" size="touch" disabled>
                  Touch secondary disabled
                </Button>
                <Button variant="destructive" size="touch" disabled>
                  Touch destructive disabled
                </Button>
              </div>
            </div>
          </SubSection>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </Section>

        <Section title="Form Controls" description="Inputs in a match setup context.">
          <div className="grid max-w-sm gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="match-name">Match name</Label>
              <Input id="match-name" defaultValue="Friday Ladder Final" placeholder="Welcome to edit" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="operator-note">Operator note</Label>
              <Textarea id="operator-note" defaultValue="Table 2 stream is delayed by 8 seconds." className={'min-h-20'} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost">Reset</Button>
              <Button>Save</Button>
            </div>
          </div>
        </Section>

        <Section title="Separator">
          <div className="grid gap-3">
            <Separator />
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-text-ghost">or</span>
              <Separator className="flex-1" />
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
