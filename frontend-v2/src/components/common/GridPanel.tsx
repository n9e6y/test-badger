import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const CORNER =
  'pointer-events-none absolute size-[11px] bg-[linear-gradient(var(--foreground),var(--foreground))_center/1px_100%_no-repeat,linear-gradient(var(--foreground),var(--foreground))_center/100%_1px_no-repeat]'

/** v2 blueprint panel: ink frame, light grid ground, "+" registration marks (new-app dashboard demo card). */
export function GridPanel({
  children,
  className,
  as: Tag = 'section',
  ...rest
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'aside'
} & Record<`aria-${string}`, string | undefined>) {
  return (
    <Tag
      {...rest}
      className={cn(
        'relative border border-foreground bg-surface bg-[linear-gradient(rgba(10,10,10,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(10,10,10,0.05)_1px,transparent_1px)] bg-[size:24px_24px]',
        className,
      )}
    >
      <span aria-hidden className={cn(CORNER, '-top-1.5 -left-1.5')} />
      <span aria-hidden className={cn(CORNER, '-top-1.5 -right-1.5')} />
      <span aria-hidden className={cn(CORNER, '-bottom-1.5 -left-1.5')} />
      <span aria-hidden className={cn(CORNER, '-right-1.5 -bottom-1.5')} />
      {children}
    </Tag>
  )
}
