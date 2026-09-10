import { cva, type VariantProps } from 'class-variance-authority'

import { Button } from './button'
import { Separator } from './separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet'
import { ToggleGroup, ToggleGroupItem } from './toggle-group'
import { cn } from './utils'

const navigationLinkVariants = cva(
  'relative flex min-h-12 items-center rounded-sm px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 lg:min-h-14 lg:px-5',
  {
    variants: {
      state: {
        default: 'text-text-lo hover:bg-muted hover:text-foreground',
        active:
          'bg-primary/10 text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary',
        disabled: 'cursor-not-allowed text-text-ghost opacity-60',
      },
    },
    defaultVariants: { state: 'default' },
  },
)

type NavigationLinkProps = {
  children: React.ReactNode
  className?: string
  href?: string
  shortIndicator?: boolean
  state?: VariantProps<typeof navigationLinkVariants>['state']
}

function NavigationLink({
  children,
  className,
  href,
  shortIndicator = false,
  state = 'default',
}: NavigationLinkProps) {
  const classes = cn(
    navigationLinkVariants({ state }),
    shortIndicator && state === 'active' && 'after:right-auto after:left-3 after:w-10 after:translate-x-0',
    className,
  )

  if (state === 'disabled') {
    return (
      <span aria-disabled="true" className={classes}>
        {children}
      </span>
    )
  }

  return (
    <a href={href} aria-current={state === 'active' ? 'page' : undefined} className={classes}>
      {children}
    </a>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function DrawerNavigation() {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label="Open match menu" />}
        className="lg:mr-2"
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Keep score</SheetTitle>
          <SheetDescription>Match navigation and viewing preferences.</SheetDescription>
        </SheetHeader>
        <SheetClose
          render={<Button variant="ghost" size="icon" aria-label="Close match menu" />}
          className="absolute top-3 right-3"
        >
          <CloseIcon />
        </SheetClose>

        <div className="flex flex-1 flex-col overflow-y-auto p-3">
          <nav className="flex flex-col gap-1" aria-label="Drawer navigation">
            <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-widest text-text-lo uppercase">
              Sparring
            </p>
            <SheetClose
              nativeButton={false}
              render={
                <a href="#new-match" className={navigationLinkVariants()}>
                  New match
                </a>
              }
            />
            <SheetClose
              nativeButton={false}
              render={
                <a href="#all-matches" className={navigationLinkVariants()}>
                  All matches
                </a>
              }
            />
            <NavigationLink state="active" href="#current-match" shortIndicator>
              Current match
            </NavigationLink>
            <NavigationLink state="disabled">Tournament desk</NavigationLink>
          </nav>

          <Separator className="my-4" />

          <section className="flex flex-col gap-3 px-3" aria-labelledby="preview-theme-label">
            <p
              id="preview-theme-label"
              className="text-xs font-semibold tracking-widest text-text-lo uppercase"
            >
              Appearance
            </p>
            <ToggleGroup defaultValue={['dark']} aria-labelledby="preview-theme-label">
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="system">System</ToggleGroupItem>
            </ToggleGroup>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MatchNavigation() {
  return (
    <nav
      className="sticky top-0 z-40 flex min-h-12 items-stretch border-b border-border bg-background/95 backdrop-blur lg:min-h-14"
      aria-label="Match navigation preview"
    >
      <a
        href="#brand"
        className="hidden items-center px-5 text-sm font-bold tracking-[0.18em] text-primary uppercase lg:flex"
      >
        Keep score
      </a>
      <NavigationLink href="#control" state="active" className="flex-1 justify-center lg:flex-none">
        Control
      </NavigationLink>
      <NavigationLink href="#protocol" className="flex-1 justify-center lg:flex-none">
        Protocol
      </NavigationLink>
      <NavigationLink state="disabled" className="hidden lg:flex">
        Statistics
      </NavigationLink>
      <div className="hidden flex-1 lg:block" />
      <div className="flex flex-1 items-center justify-center lg:flex-none">
        <DrawerNavigation />
      </div>
    </nav>
  )
}

export { MatchNavigation }
