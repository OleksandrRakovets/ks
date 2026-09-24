import {
  Button,
  NavigationLink,
  Separator,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui'

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
            <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Sparring
            </p>
            <SheetClose
              nativeButton={false}
              render={
                <NavigationLink render={<a href="#new-match" aria-label="New match" />}>
                  New match
                </NavigationLink>
              }
            />
            <SheetClose
              nativeButton={false}
              render={
                <NavigationLink render={<a href="#all-matches" aria-label="All matches" />}>
                  All matches
                </NavigationLink>
              }
            />
            <NavigationLink
              render={<a href="#current-match" aria-label="Current match" />}
              state="active"
              indicator="short"
            >
              Current match
            </NavigationLink>
            <NavigationLink state="disabled">Tournament desk</NavigationLink>
          </nav>

          <Separator className="my-4" />

          <section className="flex flex-col gap-3 px-3" aria-labelledby="preview-theme-label">
            <p
              id="preview-theme-label"
              className="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
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
      <NavigationLink
        render={<a href="#control" aria-label="Control" />}
        state="active"
        className="flex-1 justify-center lg:flex-none"
      >
        Control
      </NavigationLink>
      <NavigationLink
        render={<a href="#protocol" aria-label="Protocol" />}
        className="flex-1 justify-center lg:flex-none"
      >
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
