import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

/** Badger head, front on: pointed ears, white blaze, cheek stripes and eye bands; it tapers like a
 *  drill bit and the snout breaks through the ground line. */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className={cn('block flex-none', className)}>
      <path d="M3 8 L6.5 3 L10 6 L18 6 L21.5 3 L25 8 L23 15.5 L14 26 L5 15.5 Z" fill="currentColor" />
      <polygon points="12,6 16,6 15,19.5 13,19.5" fill="var(--background)" />
      <polygon points="4,9.5 6,10.5 11.6,22.4 5.6,15.4" fill="var(--background)" />
      <polygon points="24,9.5 22,10.5 16.4,22.4 22.4,15.4" fill="var(--background)" />
      <circle cx="9.6" cy="12.4" r="1" fill="var(--background)" />
      <circle cx="18.4" cy="12.4" r="1" fill="var(--background)" />
      <line x1="0" y1="22.5" x2="8.6" y2="22.5" stroke="var(--primary)" strokeWidth="1.4" />
      <line x1="19.4" y1="22.5" x2="28" y2="22.5" stroke="var(--primary)" strokeWidth="1.4" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-heading text-[23px] font-bold tracking-[-0.01em]', className)}>
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
