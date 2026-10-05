import { FlaskConical, Plus, ShoppingCart, UserPlus } from 'lucide-react'

import { useMe } from '@/api/hooks'
import { EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'

// Day 1: static shell. Demo-run buttons, sites and runs are wired up on Day 3–4.
export function Dashboard() {
  const me = useMe()
  const firstName = me.data?.name.split(' ')[0]

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hi {firstName}</h1>
        <p className="text-muted-foreground">Check your site's key flows before you release.</p>
      </div>

      <section className="rounded-xl border-2 border-primary/20 bg-background p-6">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 size-5" aria-hidden />
          <div className="flex-1">
            <h2 className="font-medium">Try it on our demo shop</h2>
            <p className="text-sm text-muted-foreground">
              A real store with hidden bugs. See what the agent finds in about 5 minutes.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button disabled title="Coming soon">
                <UserPlus className="size-4" aria-hidden />
                Test registration
              </Button>
              <Button variant="outline" disabled title="Coming soon">
                <ShoppingCart className="size-4" aria-hidden />
                Test store &amp; checkout
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">My sites</h2>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <Plus className="size-4" aria-hidden />
            Add a site
          </Button>
        </div>
        <EmptyState title="No sites yet">
          Start with the demo shop above, or add your own site.
        </EmptyState>
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Recent runs</h2>
        <EmptyState title="No runs yet">Your test runs will show up here.</EmptyState>
      </section>
    </div>
  )
}
