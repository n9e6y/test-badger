import { LogOut } from 'lucide-react'
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
import { cn } from '@/lib/utils'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase()
}

/** Protects /app/* routes and renders the top bar. */
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
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => navigate('/'),
      onError: (err) => toast.error(err.message),
    })

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 sm:px-5">
          <Logo to="/app" label="test-badger dashboard" />
          <nav aria-label="Main" className="hidden sm:flex">
            <NavLink
              to="/app"
              end
              className={({ isActive }) =>
                cn(
                  'border-b-2 px-2.5 py-1.5 text-[15px]',
                  isActive ? 'border-primary' : 'border-transparent hover:border-border',
                )
              }
            >
              Dashboard
            </NavLink>
          </nav>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Account: ${me.data.name}`}
                className="grid size-10 place-items-center border font-heading text-sm font-semibold hover:bg-accent"
              >
                {initials(me.data.name)}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <span className="block font-medium">{me.data.name}</span>
                  <span className="block text-muted-foreground">{me.data.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/app')} className="sm:hidden">
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut className="size-4" aria-hidden />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 pt-7 pb-16 sm:px-5">
        <Outlet />
      </main>
    </div>
  )
}
