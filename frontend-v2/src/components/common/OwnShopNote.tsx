import { Info } from 'lucide-react'

import { useProjects } from '@/api/hooks'

function originOf(raw: string): string | null {
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).origin
  } catch {
    return null
  }
}

/**
 * D36: shown when a user's own site is our demo shop. Its server address is private, but the
 * backend allows exactly this one site for testing.
 */
export function OwnShopNote({ url, className }: { url: string; className?: string }) {
  const projects = useProjects()
  const demo = projects.data?.find((p) => p.is_demo)
  const origin = originOf(url.trim())
  if (!demo || !origin || origin !== originOf(demo.base_url)) return null
  return (
    <p className={`flex items-start gap-1.5 text-xs text-muted-foreground ${className ?? ''}`}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      This is our own demo shop. Its server address is private, but it is allowed for testing.
    </p>
  )
}
