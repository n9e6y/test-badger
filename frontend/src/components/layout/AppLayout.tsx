import { ChevronDown, LogOut } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useLogout, useMe } from '@/api/hooks'
import { Logo } from '@/components/common/Logo'
import { ErrorState, FullPageSpinner } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Protects /app/* routes and renders the top bar. */
export function AppLayout() {
  const me = useMe()
  const logout = useLogout()
  const navigate = useNavigate()
  const location = useLocation()

  if (me.isPending) return <FullPageSpinner />
  if (me.isError) return <ErrorState message={me.error.message} onRetry={() => me.refetch()} />
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const onLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => navigate('/'),
      onError: (err) => toast.error(err.message),
    })

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Logo to="/app" />
            <nav>
              <Link to="/app" className="text-sm text-muted-foreground hover:text-foreground">
                Dashboard
              </Link>
            </nav>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {me.data.name}
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="font-normal text-muted-foreground">
                {me.data.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onLogout}>
                <LogOut className="size-4" aria-hidden />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
