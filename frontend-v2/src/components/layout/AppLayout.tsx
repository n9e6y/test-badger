import { ChevronDown, LogOut } from 'lucide-react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useLogout, useMe } from '@/api/hooks'
import { Logo } from '@/components/common/Logo'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { INFO_PAGES } from '@/lib/pages'
import { cn } from '@/lib/utils'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase()
}

const money = (usd: number) => `$${usd.toFixed(2)}`

const NAV = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/sites', label: 'Sites', end: false },
  { to: '/app/runs', label: 'Runs', end: false },
] as const

/** Protects /app/* routes and renders the v2 app bar (new-app TB-AppBar). */
export function AppLayout() {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const location = useLocation()

  if (me.isPending) return <FullPageSpinner />
  if (me.isError)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorState message={me.error.message} onRetry={() => me.refetch()} />
      </div>
    )
  // After logging out, go home (not to the login page the auth guard below would pick).
  if (logout.isSuccess) return <Navigate to="/" replace />
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const user = me.data
  const firstName = user.name.split(' ')[0]
  const onLogout = () => logout.mutate(undefined, { onError: (err) => toast.error(err.message) })

  const menuItems = (
    <>
      <DropdownMenuLabel className="font-normal">
        <span className="block font-semibold">{user.name}</span>
        <span className="block text-muted-foreground">{user.email}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {INFO_PAGES.map((p) => (
        <DropdownMenuItem key={p.href} onSelect={() => window.location.assign(p.href)}>
          {p.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onLogout}>
        <LogOut className="size-4" aria-hidden />
        Log out
      </DropdownMenuItem>
    </>
  )

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-[60px] max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex h-full items-center gap-10">
            <Logo to="/app" label="test-badger dashboard" />
            <nav aria-label="Main" className="hidden h-full gap-7 md:flex">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cn(
                      'flex h-full items-center border-b-2 pt-0.5 text-[15px] font-semibold',
                      isActive ? 'border-foreground' : 'border-transparent hover:border-border',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="hidden items-center gap-5 md:flex">
            {user.budget_left_usd !== null && (
              <div className="flex flex-col items-end gap-0.5 leading-none">
                <span className="text-[11px] font-semibold tracking-[0.14em] uppercase">AI budget left</span>
                <span className="font-heading text-xl font-semibold">
                  {money(user.budget_left_usd)}
                  {user.budget_total_usd !== null && (
                    <span className="font-sans text-[13px] font-normal"> of {money(user.budget_total_usd)}</span>
                  )}
                </span>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="flex h-10 items-center gap-2 border py-0 pr-2.5 pl-1 text-sm font-semibold hover:bg-accent"
              >
                <span className="grid size-[30px] place-items-center bg-foreground text-xs font-bold text-background">
                  {initials(user.name)}
                </span>
                {firstName}
                <ChevronDown className="size-3.5 stroke-[2.5]" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-60">
                {menuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Open menu"
              className="flex size-11 flex-col items-center justify-center gap-[5px] border md:hidden"
            >
              <span className="block h-0.5 w-[18px] bg-foreground" />
              <span className="block h-0.5 w-[18px] bg-foreground" />
              <span className="block h-0.5 w-[18px] bg-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              {NAV.map((n) => (
                <DropdownMenuItem key={n.to} onSelect={() => navigate(n.to)} className="font-semibold">
                  {n.label}
                </DropdownMenuItem>
              ))}
              {user.budget_left_usd !== null && (
                <DropdownMenuLabel className="font-normal">
                  AI budget left: <strong>{money(user.budget_left_usd)}</strong>
                  {user.budget_total_usd !== null && ` of ${money(user.budget_total_usd)}`}
                </DropdownMenuLabel>
              )}
              <DropdownMenuSeparator />
              {menuItems}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-4 pt-6 pb-14 sm:px-6 lg:pt-8">
        <Outlet />
      </main>
    </div>
  )
}
