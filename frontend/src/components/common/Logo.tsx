import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

/** Badger head seen from above, pointing down like a drill bit; the snout breaks the steel ground line. */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className={cn('block flex-none', className)}>
      <polygon points="3,5 25,5 14,25" fill="currentColor" />
      <polygon points="11.6,5 16.4,5 14,14.5" fill="var(--background)" />
      <line x1="1" y1="20" x2="9.6" y2="20" stroke="var(--primary)" strokeWidth="1.6" />
      <line x1="18.4" y1="20" x2="27" y2="20" stroke="var(--primary)" strokeWidth="1.6" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-heading text-[23px] font-semibold tracking-[-0.01em]', className)}>
      test<span className="text-primary">-</span>badger
    </span>
  )
}

export function Logo({ to = '/', label = 'test-badger home' }: { to?: string; label?: string }) {
  return (
    <Link to={to} aria-label={label} className="inline-flex items-center gap-2 text-foreground">
      <LogoMark />
      <Wordmark />
    </Link>
  )
}
