import { ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold tracking-tight">
      <ShieldCheck className="size-5" aria-hidden />
      ShipCheck
    </Link>
  )
}
