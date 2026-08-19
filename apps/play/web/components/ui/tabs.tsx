import { Tabs } from 'radix-ui'
import * as React from 'react'

import { cn } from './utils'

function TabsRoot({ ...props }: React.ComponentProps<typeof Tabs.Root>) {
  return <Tabs.Root {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof Tabs.List>) {
  return <Tabs.List className={cn('flex border-b border-border', className)} {...props} />
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Tabs.Trigger>) {
  return (
    <Tabs.Trigger
      className={cn(
        '-mb-px flex-1 border-b-2 border-transparent py-2.5 text-sm font-medium text-muted-foreground',
        'transition-colors hover:text-foreground',
        'data-[state=active]:border-primary data-[state=active]:text-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof Tabs.Content>) {
  return <Tabs.Content className={cn('outline-none', className)} {...props} />
}

export { TabsRoot as Tabs, TabsContent, TabsList, TabsTrigger }
