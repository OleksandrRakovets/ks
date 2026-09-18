import * as React from 'react'

import { cn } from './utils'

function Card({ className, ...props }: React.ComponentProps<'article'>) {
  return (
    <article
      data-slot="card"
      className={cn('flex flex-col rounded-lg border border-border bg-card text-card-foreground', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header className={cn('flex flex-col gap-1 border-b border-border px-5 py-4', className)} {...props} />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-base font-semibold', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-base leading-relaxed text-muted-foreground', className)} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-1 flex-col gap-4 p-5', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'footer'>) {
  return (
    <footer className={cn('flex items-center gap-2 border-t border-border px-5 py-4', className)} {...props} />
  )
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
