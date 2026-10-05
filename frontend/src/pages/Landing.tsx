import { CheckCircle2, ClipboardList, Eye, Wrench, XCircle } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'

import { useMe } from '@/api/hooks'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VERDICT_STYLES } from '@/lib/verdict'

const STEPS = [
  { icon: ClipboardList, title: 'Describe', text: 'Add your site and pick what to test.' },
  { icon: Eye, title: 'Watch', text: 'Approve the plan and watch the agent test in a real browser.' },
  { icon: Wrench, title: 'Fix', text: 'Get a clear report with screenshots and steps to reproduce.' },
]

function ExampleReportCard() {
  return (
    <div className="rounded-xl border bg-background p-5 shadow-sm" aria-label="Example report">
      <div
        className={cn(
          'mb-3 rounded-md border px-3 py-2 text-sm font-medium',
          VERDICT_STYLES.problems.className,
        )}
      >
        Problems found — fix before release
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <XCircle className="size-4 text-orange-600" aria-hidden />
          Expired coupon is accepted
        </li>
        <li className="flex items-center gap-2">
          <XCircle className="size-4 text-orange-600" aria-hidden />
          "Remove" button in the cart does nothing
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-green-600" aria-hidden />
          Checkout reaches the payment step
        </li>
      </ul>
    </div>
  )
}

export function Landing() {
  const me = useMe()
  if (me.data) return <Navigate to="/app" replace />

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link to="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Sign up</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Find what's broken on your site before your users do
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              An AI tester that plans checks for your signup, cart and checkout, runs them in a
              real browser, and tells you in plain words what's broken.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">Start free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">I have an account</Link>
              </Button>
            </div>
          </div>
          <ExampleReportCard />
        </section>

        <section className="grid gap-4 pb-20 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="rounded-xl border bg-background p-5">
              <Icon className="size-5" aria-hidden />
              <h2 className="mt-3 font-medium">
                {i + 1}. {title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
